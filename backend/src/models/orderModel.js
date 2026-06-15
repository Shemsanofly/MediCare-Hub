import db from '../config/database.js';
import { generateId, nowISO } from '../utils/helpers.js';

export function findOrderById(id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

export function findOrderItemById(id) {
  return db.prepare('SELECT * FROM order_items WHERE id = ?').get(id);
}

export function findOrderItems(orderId) {
  return db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
}

export function createOrder({ buyer_id, organisation_id, supplier_id, status = 'PENDING', subtotal = 0, delivery_fee = 0, tax_amount = 0, total_amount = 0, currency = 'TZS', lpo_number, payment_terms = 'IMMEDIATE', notes }) {
  const id = generateId();
  const now = nowISO();
  db.prepare(`
    INSERT INTO orders (id, buyer_id, organisation_id, supplier_id, status, subtotal, delivery_fee, tax_amount, total_amount, currency, lpo_number, payment_terms, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, buyer_id, organisation_id, supplier_id, status, subtotal, delivery_fee, tax_amount, total_amount, currency, lpo_number || null, payment_terms, notes || null, now, now);
  return findOrderById(id);
}

export function createOrderItem({ order_id, product_id, batch_id, quantity_ordered, unit_price, subtotal }) {
  const id = generateId();
  db.prepare(`
    INSERT INTO order_items (id, order_id, product_id, batch_id, quantity_ordered, unit_price, subtotal)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, order_id, product_id, batch_id, quantity_ordered, unit_price, subtotal);
  return findOrderItemById(id);
}

export function updateOrderStatus(id, status) {
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, nowISO(), id);
  return findOrderById(id);
}

export function addStatusHistory({ order_id, from_status, to_status, changed_by_id, reason }) {
  const id = generateId();
  db.prepare(`
    INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_id, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, order_id, from_status || null, to_status, changed_by_id || null, reason || null, nowISO());
  return id;
}

export function createApprovalStep({ order_id, step_number, required_role, threshold_amount = 0 }) {
  const id = generateId();
  db.prepare(`
    INSERT INTO approval_steps (id, order_id, step_number, required_role, threshold_amount, status)
    VALUES (?, ?, ?, ?, ?, 'PENDING')
  `).run(id, order_id, step_number, required_role, threshold_amount);
  return id;
}

export function findApprovalSteps(orderId) {
  return db.prepare('SELECT * FROM approval_steps WHERE order_id = ? ORDER BY step_number').all(orderId);
}

export function approveNextStep(orderId, approverId) {
  const step = db.prepare(`
    SELECT * FROM approval_steps
    WHERE order_id = ? AND status = 'PENDING'
    ORDER BY step_number LIMIT 1
  `).get(orderId);

  if (!step) return null;

  db.prepare(`
    UPDATE approval_steps
    SET status = 'APPROVED', approver_id = ?, approved_at = ?
    WHERE id = ?
  `).run(approverId, nowISO(), step.id);

  const remaining = db.prepare(`
    SELECT COUNT(*) as count FROM approval_steps
    WHERE order_id = ? AND status = 'PENDING'
  `).get(orderId).count;

  return { step, allApproved: remaining === 0 };
}

export function rejectStep(orderId, approverId, reason) {
  const step = db.prepare(`
    SELECT * FROM approval_steps
    WHERE order_id = ? AND status = 'PENDING'
    ORDER BY step_number LIMIT 1
  `).get(orderId);

  if (!step) return null;

  db.prepare(`
    UPDATE approval_steps
    SET status = 'REJECTED', approver_id = ?, approved_at = ?, rejection_reason = ?
    WHERE id = ?
  `).run(approverId, nowISO(), reason || null, step.id);

  return step;
}

export function listOrdersForBuyerOrganisation(organisationId, { status = '', limit = 50, offset = 0 } = {}) {
  let sql = `SELECT * FROM orders WHERE organisation_id = ?`;
  const params = [organisationId];
  if (status) {
    sql += ` AND status = ?`;
    params.push(status);
  }
  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

export function listOrdersForSupplier(supplierId, { status = '', limit = 50, offset = 0 } = {}) {
  let sql = `SELECT * FROM orders WHERE supplier_id = ?`;
  const params = [supplierId];
  if (status) {
    sql += ` AND status = ?`;
    params.push(status);
  }
  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

export function listAllOrders({ status = '', search = '', limit = 50, offset = 0 } = {}) {
  let sql = `SELECT o.* FROM orders o JOIN organisations org ON org.id = o.organisation_id WHERE 1=1`;
  const params = [];
  if (status) {
    sql += ` AND o.status = ?`;
    params.push(status);
  }
  if (search) {
    sql += ` AND (org.name LIKE ? OR o.id LIKE ? OR o.lpo_number LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

export function createBatchReservation({ order_id, order_item_id, batch_id, quantity }) {
  const id = generateId();
  db.prepare(`
    INSERT INTO batch_reservations (id, order_id, order_item_id, batch_id, quantity)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, order_id, order_item_id, batch_id, quantity);
  return id;
}

export function findReservationsByOrder(orderId) {
  return db.prepare('SELECT * FROM batch_reservations WHERE order_id = ?').all(orderId);
}

export function releaseReservations(orderId) {
  const reservations = findReservationsByOrder(orderId);
  for (const r of reservations) {
    if (!r.is_released && !r.is_fulfilled) {
      db.prepare(`
        UPDATE product_batches SET reserved_quantity = MAX(reserved_quantity - ?, 0), updated_at = ?
        WHERE id = ?
      `).run(r.quantity, nowISO(), r.batch_id);
      db.prepare('UPDATE batch_reservations SET is_released = 1 WHERE id = ?').run(r.id);
    }
  }
}

export function fulfillReservations(orderId) {
  const reservations = findReservationsByOrder(orderId);
  for (const r of reservations) {
    if (!r.is_released && !r.is_fulfilled) {
      db.prepare(`
        UPDATE product_batches
        SET quantity = quantity - ?, reserved_quantity = MAX(reserved_quantity - ?, 0), updated_at = ?
        WHERE id = ?
      `).run(r.quantity, r.quantity, nowISO(), r.batch_id);
      db.prepare('UPDATE batch_reservations SET is_fulfilled = 1 WHERE id = ?').run(r.id);
    }
  }
}
