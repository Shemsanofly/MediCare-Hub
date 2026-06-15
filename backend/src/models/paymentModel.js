import db from '../config/database.js';
import { generateId, nowISO } from '../utils/helpers.js';

export function findPaymentById(id) {
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
}

export function findPaymentByOrder(orderId) {
  return db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderId);
}

export function createPayment({ order_id, gateway, amount, currency = 'TZS', transaction_reference, gateway_reference }) {
  const id = generateId();
  db.prepare(`
    INSERT INTO payments (id, order_id, gateway, amount, currency, transaction_reference, gateway_reference, status, initiated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
  `).run(id, order_id, gateway, amount, currency, transaction_reference, gateway_reference || null, nowISO());
  return findPaymentById(id);
}

export function updatePaymentStatus(id, { status, gateway_response, completed_at, gateway_reference }) {
  db.prepare(`
    UPDATE payments
    SET status = ?, gateway_response = ?, completed_at = ?, gateway_reference = ?
    WHERE id = ?
  `).run(status, gateway_response || null, completed_at || null, gateway_reference || null, id);
  return findPaymentById(id);
}

export function findPaymentByOrderIds(orderIds) {
  if (!orderIds.length) return [];
  const placeholders = orderIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM payments WHERE order_id IN (${placeholders})`).all(...orderIds);
}

export function createEscrow({ order_id, payment_id, amount_held, release_trigger = 'GRN_SIGNED' }) {
  const id = generateId();
  db.prepare(`
    INSERT INTO escrow_accounts (id, order_id, payment_id, amount_held, release_trigger, held_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, order_id, payment_id, amount_held, release_trigger, nowISO());
  return id;
}

export function findEscrowByOrder(orderId) {
  return db.prepare('SELECT * FROM escrow_accounts WHERE order_id = ?').get(orderId);
}

export function updateEscrowStatus(id, { status, released_at, dispute_reason }) {
  db.prepare(`
    UPDATE escrow_accounts
    SET status = ?, released_at = ?, dispute_reason = ?
    WHERE id = ?
  `).run(status, released_at || null, dispute_reason || null, id);
  return findEscrowByOrder ? findEscrowByOrder : null;
}

export function createPayout({ escrow_account_id, order_id, supplier_id, amount, currency = 'TZS', gateway_reference }) {
  const id = generateId();
  db.prepare(`
    INSERT INTO payout_transactions (id, escrow_account_id, order_id, supplier_id, amount, currency, gateway_reference, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, escrow_account_id, order_id, supplier_id, amount, currency, gateway_reference || null, nowISO());
  return id;
}

export function createWebhookLog({ gateway, raw_payload, headers, signature, ip_address }) {
  const id = generateId();
  db.prepare(`
    INSERT INTO webhook_logs (id, gateway, raw_payload, headers, signature, ip_address, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, gateway, raw_payload, headers, signature || null, ip_address || null, nowISO());
  return id;
}

export function updateWebhookLog(id, { processing_status, processing_error, payment_id, processed_at }) {
  db.prepare(`
    UPDATE webhook_logs
    SET processing_status = ?, processing_error = ?, payment_id = ?, processed_at = ?
    WHERE id = ?
  `).run(processing_status, processing_error || null, payment_id || null, processed_at || nowISO(), id);
}
