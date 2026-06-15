import db from '../config/database.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors.js';
import { findProductById, findBatchById, getTotalAvailableQuantity, findBatchesByProduct } from '../models/productModel.js';
import { findSupplierById } from '../models/supplierModel.js';
import { formatDecimal, generateId } from '../utils/helpers.js';

const CART_TTL_HOURS = 24;

export function getCart(userId) {
  const items = db.prepare(`
    SELECT * FROM cart_items WHERE user_id = ? AND expires_at > datetime('now')
  `).all(userId);

  const enriched = items.map((item) => {
    const product = findProductById(item.product_id);
    const batch = item.batch_id ? findBatchById(item.batch_id) : null;
    const supplierRow = product ? findSupplierById(product.supplier_id) : null;
    const supplierOrg = supplierRow
      ? db.prepare('SELECT name FROM organisations WHERE id = ?').get(supplierRow.organisation_id)
      : null;
    const supplierName = supplierOrg?.name || null;
    const stock = getTotalAvailableQuantity(item.product_id);
    const unitPrice = product ? product.price : 0;
    const subtotal = unitPrice * item.quantity;

    return {
      product_id: item.product_id,
      product_name: product?.name || 'Unknown product',
      batch_id: item.batch_id,
      batch_number: batch?.batch_number || null,
      quantity: item.quantity,
      unit_price: formatDecimal(unitPrice),
      subtotal: formatDecimal(subtotal),
      currency: product?.currency || 'TZS',
      supplier_id: product?.supplier_id || null,
      supplier_name: supplierName,
      stock_available: stock,
      in_stock: stock >= item.quantity,
      is_expired: batch ? new Date(batch.expiry_date) < new Date() : false,
      minimum_order_quantity: product?.minimum_order_quantity || 1,
    };
  });

  const subtotal = enriched.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);

  return {
    items: enriched,
    item_count: enriched.length,
    subtotal: formatDecimal(subtotal),
    currency: enriched[0]?.currency || 'TZS',
  };
}

export function addToCart(userId, { product_id, quantity, batch_id }) {
  const product = findProductById(product_id);
  if (!product || !product.is_active) throw new NotFoundError('Product not found or inactive');

  const supplier = findSupplierById(product.supplier_id);
  if (supplier?.verification_status !== 'VERIFIED') {
    throw new ForbiddenError('Supplier is not verified');
  }

  const qty = parseInt(quantity, 10);
  if (Number.isNaN(qty) || qty < 1) throw new ValidationError('Quantity must be at least 1');
  if (qty < product.minimum_order_quantity) {
    throw new ValidationError(`Minimum order quantity is ${product.minimum_order_quantity}`);
  }

  let selectedBatch = null;
  if (batch_id) {
    selectedBatch = findBatchById(batch_id);
    if (!selectedBatch || selectedBatch.product_id !== product_id) {
      throw new ValidationError('Invalid batch selected');
    }
    if (new Date(selectedBatch.expiry_date) < new Date()) {
      throw new ValidationError('Selected batch is expired');
    }
    if (selectedBatch.quantity - selectedBatch.reserved_quantity < qty) {
      throw new ValidationError('Insufficient stock in selected batch');
    }
  }

  const stock = getTotalAvailableQuantity(product_id);
  if (stock < qty) throw new ValidationError('Insufficient stock');

  // Carts may contain items from multiple suppliers; checkout splits them into
  // one order per supplier.
  const existingItems = db.prepare(`SELECT * FROM cart_items WHERE user_id = ? AND expires_at > datetime('now')`).all(userId);

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + CART_TTL_HOURS);

  const existing = existingItems.find((i) => i.product_id === product_id && i.batch_id === (batch_id || null));
  if (existing) {
    const newQty = existing.quantity + qty;
    if (stock < newQty) throw new ValidationError('Insufficient stock for updated quantity');
    db.prepare(`
      UPDATE cart_items SET quantity = ?, expires_at = ? WHERE id = ?
    `).run(newQty, expiresAt.toISOString(), existing.id);
  } else {
    db.prepare(`
      INSERT INTO cart_items (id, user_id, product_id, batch_id, quantity, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(generateId(), userId, product_id, batch_id || null, qty, expiresAt.toISOString());
  }

  return getCart(userId);
}

export function removeFromCart(userId, { product_id, batch_id }) {
  if (!product_id) throw new ValidationError('product_id is required');

  db.prepare(`
    DELETE FROM cart_items WHERE user_id = ? AND product_id = ? AND (batch_id = ? OR (batch_id IS NULL AND ? IS NULL))
  `).run(userId, product_id, batch_id || null, batch_id || null);

  return getCart(userId);
}

export function clearCart(userId) {
  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
}

// Ensure cart_items table exists; added here to avoid cart orphaning if schema drift occurs
export function initCartTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      batch_id TEXT REFERENCES product_batches(id) ON DELETE SET NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);
  `);
}
