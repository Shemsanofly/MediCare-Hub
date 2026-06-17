import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

/**
 * Best-effort deletion of a file stored under the uploads directory.
 * Cascade deletion should not fail just because a file is missing or locked.
 */
function safeDeleteFile(filePath) {
  if (!filePath) return;
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(UPLOADS_DIR, filePath);
  try {
    if (fs.existsSync(absolute) && fs.lstatSync(absolute).isFile()) {
      fs.unlinkSync(absolute);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[cascade] failed to delete file ${absolute}:`, err.message);
  }
}

/**
 * Delete a single order and every child record tied to it.
 *
 * The schema uses a mix of ON DELETE CASCADE and RESTRICT, so we delete in an
 * explicit order that respects the foreign keys:
 *   payouts -> escrow -> payments -> grn -> reservations -> items -> history -> approvals -> order
 *
 * This helper is intended to run inside a larger transaction (adminService wraps
 * the public cascade functions in db.transaction()).
 */
function deleteOrderCompletely(orderId) {
  const paymentIds = db
    .prepare('SELECT id FROM payments WHERE order_id = ?')
    .all(orderId)
    .map((r) => r.id);

  if (paymentIds.length > 0) {
    const placeholders = paymentIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM webhook_logs WHERE payment_id IN (${placeholders})`).run(...paymentIds);
  }

  db.prepare('DELETE FROM payout_transactions WHERE order_id = ?').run(orderId);
  db.prepare('DELETE FROM escrow_accounts WHERE order_id = ?').run(orderId);
  db.prepare('DELETE FROM payments WHERE order_id = ?').run(orderId);
  db.prepare('DELETE FROM goods_received_notes WHERE order_id = ?').run(orderId);
  db.prepare('DELETE FROM batch_reservations WHERE order_id = ?').run(orderId);
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);
  db.prepare('DELETE FROM order_status_history WHERE order_id = ?').run(orderId);
  db.prepare('DELETE FROM approval_steps WHERE order_id = ?').run(orderId);
  db.prepare('DELETE FROM orders WHERE id = ?').run(orderId);
}

/**
 * Cascade-delete a user and all data directly associated with them.
 *
 * Removes:
 *   - Orders placed by the user (with all order children)
 *   - Cart items, notifications, sessions, auth tokens and audit logs
 *   - The user record itself
 *
 * References that use ON DELETE SET NULL (approvals, status history, GRNs)
 * are intentionally left in place with a null user id so the platform retains
 * an anonymised order audit trail.
 */
export function cascadeDeleteUser(userId) {
  const orderIds = db
    .prepare('SELECT id FROM orders WHERE buyer_id = ?')
    .all(userId)
    .map((r) => r.id);

  for (const orderId of orderIds) {
    deleteOrderCompletely(orderId);
  }

  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM notifications WHERE recipient_id = ?').run(userId);
  db.prepare('DELETE FROM auth_tokens WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM audit_logs WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

/**
 * Cascade-delete a supplier and everything tied to it.
 *
 * Removes:
 *   - All orders where this supplier is the seller
 *   - All orders belonging to the supplier organisation (covers any edge case
 *     where a supplier-org user was used as a buyer)
 *   - Cart items referencing the supplier's products
 *   - The supplier, its products, batches, images, price history and documents
 *   - All users and the organisation linked to the supplier
 *
 * Returns the list of uploaded file paths that should be deleted from disk
 * after the database transaction commits.
 */
export function cascadeDeleteSupplier(supplierId) {
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
  if (!supplier) {
    return { imagePaths: [], docPaths: [] };
  }

  const productIds = db
    .prepare('SELECT id FROM products WHERE supplier_id = ?')
    .all(supplierId)
    .map((r) => r.id);

  const imagePaths = [];
  if (productIds.length > 0) {
    const placeholders = productIds.map(() => '?').join(',');
    imagePaths.push(
      ...db
        .prepare(`SELECT file_path FROM product_images WHERE product_id IN (${placeholders})`)
        .all(...productIds)
        .map((r) => r.file_path)
    );
    imagePaths.push(
      ...db
        .prepare(`SELECT image_url FROM products WHERE id IN (${placeholders}) AND image_url IS NOT NULL`)
        .all(...productIds)
        .map((r) => r.image_url)
    );
  }

  const docPaths = db
    .prepare('SELECT file_path FROM supplier_documents WHERE supplier_id = ?')
    .all(supplierId)
    .map((r) => r.file_path);

  const supplierOrderIds = db
    .prepare('SELECT id FROM orders WHERE supplier_id = ?')
    .all(supplierId)
    .map((r) => r.id);
  for (const orderId of supplierOrderIds) {
    deleteOrderCompletely(orderId);
  }

  // Defensive: delete any order that references the supplier organisation.
  // organisations.id is ON DELETE RESTRICT on orders, so all org orders must
  // go before the organisation itself can be removed.
  const orgOrderIds = db
    .prepare('SELECT id FROM orders WHERE organisation_id = ?')
    .all(supplier.organisation_id)
    .map((r) => r.id);
  for (const orderId of orgOrderIds) {
    deleteOrderCompletely(orderId);
  }

  // payout_transactions has a RESTRICT foreign key back to suppliers; any
  // straggler payouts for this supplier must be removed before the supplier row.
  db.prepare('DELETE FROM payout_transactions WHERE supplier_id = ?').run(supplierId);

  if (productIds.length > 0) {
    const placeholders = productIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM cart_items WHERE product_id IN (${placeholders})`).run(...productIds);
  }

  // supplier_documents, products, product_images, product_batches and price_history
  // all cascade from suppliers, but only after orders have been removed.
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(supplierId);

  // Delete users and then the organisation. users.organisation_id is SET NULL,
  // so deleting users first avoids leaving orphaned organisation references.
  db.prepare('DELETE FROM users WHERE organisation_id = ?').run(supplier.organisation_id);
  db.prepare('DELETE FROM organisations WHERE id = ?').run(supplier.organisation_id);

  return { imagePaths, docPaths };
}

/**
 * Delete uploaded files collected by cascadeDeleteSupplier after the database
 * transaction has committed. This avoids removing files if the transaction rolls
 * back part-way through.
 */
export function deleteSupplierFiles({ imagePaths = [], docPaths = [] }) {
  for (const filePath of imagePaths) {
    safeDeleteFile(filePath);
  }
  for (const filePath of docPaths) {
    safeDeleteFile(filePath);
  }
}
