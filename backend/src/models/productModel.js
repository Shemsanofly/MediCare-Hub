import db from '../config/database.js';
import { generateId, nowISO } from '../utils/helpers.js';

export function findProductById(id) {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
}

export function findCategoryById(id) {
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

/**
 * Find every active product offered by a verified supplier that represents the
 * "same" item as the given product, so buyers can compare suppliers.
 * Identity is matched by GTIN when present, otherwise by generic name + unit.
 * The given product is always included in the result.
 */
export function findProductOffers(product) {
  const base = `
    SELECT p.* FROM products p
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.is_active = 1 AND s.verification_status = 'VERIFIED'
  `;
  let rows;
  if (product.gtin) {
    rows = db.prepare(`${base} AND p.gtin = ?`).all(product.gtin);
  } else if (product.generic_name) {
    rows = db.prepare(
      `${base} AND p.generic_name = ? COLLATE NOCASE AND p.unit_of_measure = ? COLLATE NOCASE`
    ).all(product.generic_name, product.unit_of_measure);
  } else {
    rows = db.prepare(`${base} AND p.id = ?`).all(product.id);
  }

  // Guarantee the viewed product is represented even if it is inactive or its
  // supplier is not verified (e.g. an admin previewing the listing).
  if (!rows.some((r) => r.id === product.id)) {
    rows.push(product);
  }
  return rows;
}

export function listCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY parent_id NULLS FIRST, name').all();
}

export function createProduct(data) {
  const id = generateId();
  const now = nowISO();
  db.prepare(`
    INSERT INTO products (
      id, supplier_id, name, generic_name, gtin, category_id, description, unit_of_measure,
      price, currency, minimum_order_quantity, is_cold_chain_required, temperature_range_min,
      temperature_range_max, tmda_registration_number, is_active, image_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.supplier_id,
    data.name,
    data.generic_name || null,
    data.gtin || null,
    data.category_id || null,
    data.description || null,
    data.unit_of_measure || 'unit',
    data.price,
    data.currency || 'TZS',
    data.minimum_order_quantity || 1,
    data.is_cold_chain_required ? 1 : 0,
    data.temperature_range_min || null,
    data.temperature_range_max || null,
    data.tmda_registration_number || null,
    data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
    data.image_url || null,
    now,
    now
  );
  return findProductById(id);
}

export function updateProduct(id, data) {
  const current = findProductById(id);
  if (!current) return null;

  db.prepare(`
    UPDATE products SET
      name = ?, generic_name = ?, gtin = ?, category_id = ?, description = ?, unit_of_measure = ?,
      price = ?, minimum_order_quantity = ?, is_cold_chain_required = ?, temperature_range_min = ?,
      temperature_range_max = ?, tmda_registration_number = ?, is_active = ?, image_url = ?, updated_at = ?
    WHERE id = ?
  `).run(
    data.name ?? current.name,
    data.generic_name ?? current.generic_name,
    data.gtin ?? current.gtin,
    data.category_id ?? current.category_id,
    data.description ?? current.description,
    data.unit_of_measure ?? current.unit_of_measure,
    data.price ?? current.price,
    data.minimum_order_quantity ?? current.minimum_order_quantity,
    (data.is_cold_chain_required !== undefined ? (data.is_cold_chain_required ? 1 : 0) : current.is_cold_chain_required),
    data.temperature_range_min ?? current.temperature_range_min,
    data.temperature_range_max ?? current.temperature_range_max,
    data.tmda_registration_number ?? current.tmda_registration_number,
    data.is_active !== undefined ? (data.is_active ? 1 : 0) : current.is_active,
    data.image_url ?? current.image_url,
    nowISO(),
    id
  );
  return findProductById(id);
}

export function deleteProduct(id) {
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
}

export function createBatch(data) {
  const id = generateId();
  const now = nowISO();
  db.prepare(`
    INSERT INTO product_batches (
      id, product_id, supplier_id, batch_number, manufacture_date, expiry_date, quantity,
      reserved_quantity, unit_cost, storage_conditions, tmda_batch_cert_number, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.product_id,
    data.supplier_id,
    data.batch_number,
    data.manufacture_date || null,
    data.expiry_date,
    data.quantity,
    0,
    data.unit_cost || null,
    data.storage_conditions || null,
    data.tmda_batch_cert_number || null,
    now,
    now
  );
  return findBatchById(id);
}

export function findBatchById(id) {
  return db.prepare('SELECT * FROM product_batches WHERE id = ?').get(id);
}

export function findBatchesByProduct(productId) {
  return db.prepare('SELECT * FROM product_batches WHERE product_id = ? ORDER BY expiry_date ASC').all(productId);
}

export function updateBatch(id, data) {
  const current = findBatchById(id);
  if (!current) return null;
  db.prepare(`
    UPDATE product_batches SET
      batch_number = ?, manufacture_date = ?, expiry_date = ?, quantity = ?, unit_cost = ?,
      storage_conditions = ?, tmda_batch_cert_number = ?, updated_at = ?
    WHERE id = ?
  `).run(
    data.batch_number ?? current.batch_number,
    data.manufacture_date ?? current.manufacture_date,
    data.expiry_date ?? current.expiry_date,
    data.quantity ?? current.quantity,
    data.unit_cost ?? current.unit_cost,
    data.storage_conditions ?? current.storage_conditions,
    data.tmda_batch_cert_number ?? current.tmda_batch_cert_number,
    nowISO(),
    id
  );
  return findBatchById(id);
}

export function deleteBatch(id) {
  db.prepare('DELETE FROM product_batches WHERE id = ?').run(id);
}

export function getTotalAvailableQuantity(productId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(quantity - reserved_quantity), 0) as total
    FROM product_batches
    WHERE product_id = ? AND expiry_date > date('now')
  `).get(productId);
  return row.total;
}

export function reserveBatchStock(batchId, quantity) {
  db.prepare(`
    UPDATE product_batches SET reserved_quantity = reserved_quantity + ?, updated_at = ?
    WHERE id = ? AND (quantity - reserved_quantity) >= ?
  `).run(quantity, nowISO(), batchId, quantity);
}

export function releaseBatchStock(batchId, quantity) {
  db.prepare(`
    UPDATE product_batches SET reserved_quantity = MAX(reserved_quantity - ?, 0), updated_at = ?
    WHERE id = ?
  `).run(quantity, nowISO(), batchId);
}

export function fulfillBatchStock(batchId, quantity) {
  db.prepare(`
    UPDATE product_batches
    SET quantity = quantity - ?, reserved_quantity = MAX(reserved_quantity - ?, 0), updated_at = ?
    WHERE id = ?
  `).run(quantity, quantity, nowISO(), batchId);
}

export function createProductImage({ product_id, file_path, is_primary = false }) {
  const id = generateId();
  db.prepare(`
    INSERT INTO product_images (id, product_id, file_path, is_primary, uploaded_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, product_id, file_path, is_primary ? 1 : 0, nowISO());
  return findProductImageById(id);
}

export function findProductImageById(id) {
  return db.prepare('SELECT * FROM product_images WHERE id = ?').get(id);
}

export function findProductImages(productId) {
  return db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, uploaded_at ASC').all(productId);
}

export function setPrimaryImage(productId, imageId) {
  db.prepare('UPDATE product_images SET is_primary = 0 WHERE product_id = ?').run(productId);
  db.prepare('UPDATE product_images SET is_primary = 1 WHERE id = ?').run(imageId);
}

export function deleteProductImage(id) {
  db.prepare('DELETE FROM product_images WHERE id = ?').run(id);
}
