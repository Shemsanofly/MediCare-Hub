import crypto from 'crypto';
import db from '../config/database.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors.js';
import { findOrderById, findOrdersByCheckoutGroup, updateOrderStatus, addStatusHistory } from '../models/orderModel.js';
import { findPaymentById, findPaymentByOrder, findPaymentByOrderIds, createPayment, updatePaymentStatus, createEscrow, findEscrowByOrder, updateEscrowStatus, createWebhookLog, updateWebhookLog, createPayout } from '../models/paymentModel.js';
import { findSupplierById } from '../models/supplierModel.js';
import { notifyPaymentCompleted } from './emailService.js';
import { formatDecimal, nowISO } from '../utils/helpers.js';

const PLATFORM_COMMISSION_RATE = 0.05;

export function initiatePayment(user, { order_id, payment_method, phone }) {
  const orders = resolvePayableOrders(order_id);

  if (!orders.every((order) => order.organisation_id === user.organisation?.id) && user.role !== 'ADMIN') {
    throw new ForbiddenError('You can only pay for your own orders');
  }

  if (!orders.every((order) => ['PENDING', 'ACCEPTED', 'APPROVED', 'CONFIRMED'].includes(order.status))) {
    throw new ValidationError('This order can no longer be paid for');
  }

  const existingPayments = orders.map((order) => findPaymentByOrder(order.id)).filter(Boolean);
  if (existingPayments.length === orders.length && existingPayments.every((payment) => payment.status === 'COMPLETED')) {
    throw new ValidationError('Order is already paid');
  }

  const gateway = payment_method || 'mpesa';
  const displayOrderId = orders.length > 1 ? order_id : orders[0].id;
  if (existingPayments.length) {
    const groupReference = existingPayments[0].gateway_reference || `GW-${crypto.randomBytes(8).toString('hex')}`;
    existingPayments.forEach((payment) => updatePaymentStatus(payment.id, { status: 'PENDING', gateway_reference: groupReference }));
    return serializePayment({
      ...findPaymentById(existingPayments[0].id),
      order_id: displayOrderId,
      amount: orders.reduce((sum, order) => sum + Number(order.total_amount), 0),
    });
  }

  const baseReference = `TXN-${displayOrderId}-${crypto.randomBytes(4).toString('hex')}`;
  const gatewayReference = `GW-${crypto.randomBytes(8).toString('hex')}`;

  const payments = orders.map((order, index) =>
    createPayment({
      order_id: order.id,
      gateway,
      amount: order.total_amount,
      currency: order.currency,
      transaction_reference: orders.length > 1 ? `${baseReference}-${index + 1}` : baseReference,
      gateway_reference: gatewayReference,
    }),
  );

  // In development / when gateway keys are empty, simulate immediate success
  const gatewayConfigured = process.env.SELCOM_API_KEY || process.env.MPESA_API_KEY || process.env.AIRTEL_API_KEY;
  if (!gatewayConfigured) {
    db.transaction(() => {
      payments.forEach((payment) => {
        completePaymentInternal(payment.id, { gateway_reference: gatewayReference, gateway_response: { simulated: true, phone } });
      });
    })();
    payments.forEach((payment) => void notifyPaymentCompleted(payment.order_id));
  }

  return serializePayment({
    ...findPaymentById(payments[0].id),
    order_id: displayOrderId,
    amount: orders.reduce((sum, order) => sum + Number(order.total_amount), 0),
  });
}

function resolvePayableOrders(orderIdOrGroupId) {
  const order = findOrderById(orderIdOrGroupId);
  if (order) return [order];
  const groupedOrders = findOrdersByCheckoutGroup(orderIdOrGroupId);
  if (!groupedOrders.length) throw new NotFoundError('Order not found');
  return groupedOrders;
}

export function completePaymentInternal(paymentId, { gateway_reference, gateway_response }) {
  const completedAt = nowISO();
  const payment = updatePaymentStatus(paymentId, {
    status: 'COMPLETED',
    gateway_reference,
    gateway_response: JSON.stringify(gateway_response),
    completed_at: completedAt,
  });

  const order = findOrderById(payment.order_id);
  const previousStatus = order.status;

  if (order.status === 'CONFIRMED' || order.status === 'APPROVED') {
    updateOrderStatus(order.id, 'PAID');
    addStatusHistory({ order_id: order.id, from_status: previousStatus, to_status: 'PAID', changed_by_id: null, reason: 'Payment completed' });
  }

  // Create / hold escrow
  const existingEscrow = findEscrowByOrder(order.id);
  if (!existingEscrow) {
    createEscrow({
      order_id: order.id,
      payment_id: payment.id,
      amount_held: payment.amount,
      release_trigger: 'GRN_SIGNED',
    });
  }

  return payment;
}

export function serializePayment(payment) {
  return {
    id: payment.id,
    order_id: payment.order_id,
    gateway: payment.gateway,
    amount: formatDecimal(payment.amount),
    currency: payment.currency,
    transaction_reference: payment.transaction_reference,
    gateway_reference: payment.gateway_reference || '',
    status: payment.status,
    initiated_at: payment.initiated_at,
    completed_at: payment.completed_at || null,
  };
}

export function listPaymentsForUser(user, { limit = 50, offset = 0 } = {}) {
  let orderIds = [];
  if (user.role === 'ADMIN') {
    orderIds = db.prepare('SELECT id FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset).map((o) => o.id);
  } else if (user.role === 'SUPPLIER') {
    const supplier = db.prepare('SELECT * FROM suppliers WHERE organisation_id = ?').get(user.organisation?.id);
    if (supplier) {
      orderIds = db.prepare('SELECT id FROM orders WHERE supplier_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(supplier.id, limit, offset).map((o) => o.id);
    }
  } else {
    orderIds = db.prepare('SELECT id FROM orders WHERE organisation_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(user.organisation?.id, limit, offset).map((o) => o.id);
  }

  if (!orderIds.length) return [];
  const payments = findPaymentByOrderIds(orderIds);
  return payments.map(serializePayment);
}

export function getPayment(id, user) {
  const payment = findPaymentById(id);
  if (!payment) throw new NotFoundError('Payment not found');

  const order = findOrderById(payment.order_id);
  if (user.role !== 'ADMIN' &&
      order.organisation_id !== user.organisation?.id) {
    const supplier = db.prepare('SELECT * FROM suppliers WHERE organisation_id = ?').get(user.organisation?.id);
    if (supplier?.id !== order.supplier_id) {
      throw new ForbiddenError('Access denied');
    }
  }

  return serializePayment(payment);
}

export function handleWebhook(gateway, payload, headers, ip) {
  const rawPayload = JSON.stringify(payload);
  const signature = headers['x-gateway-signature'] || headers['signature'] || '';
  const logId = createWebhookLog({
    gateway,
    raw_payload: rawPayload,
    headers: JSON.stringify(headers),
    signature,
    ip_address: ip,
  });

  try {
    const transactionReference = payload.transaction_reference || payload.reference || payload.transactionRef;
    if (!transactionReference) {
      updateWebhookLog(logId, { processing_status: 'FAILED', processing_error: 'Missing transaction reference' });
      return { status: 'FAILED', error: 'Missing transaction reference' };
    }

    const payment = db.prepare('SELECT * FROM payments WHERE transaction_reference = ?').get(transactionReference);
    if (!payment) {
      updateWebhookLog(logId, { processing_status: 'FAILED', processing_error: 'Payment not found' });
      return { status: 'FAILED', error: 'Payment not found' };
    }

    updateWebhookLog(logId, { processing_status: 'VERIFIED', payment_id: payment.id });

    const status = payload.status || payload.result || 'COMPLETED';
    if (status.toString().toUpperCase() === 'COMPLETED' || status.toString().toUpperCase() === 'SUCCESS') {
      db.transaction(() => {
        completePaymentInternal(payment.id, { gateway_reference: payment.gateway_reference, gateway_response: payload });
      })();
      updateWebhookLog(logId, { processing_status: 'PROCESSED', payment_id: payment.id });
      return { status: 'PROCESSED' };
    }

    updatePaymentStatus(payment.id, { status: 'FAILED', gateway_response: JSON.stringify(payload) });
    updateWebhookLog(logId, { processing_status: 'PROCESSED', payment_id: payment.id });
    return { status: 'PROCESSED' };
  } catch (error) {
    updateWebhookLog(logId, { processing_status: 'FAILED', processing_error: error.message });
    return { status: 'FAILED', error: error.message };
  }
}

export function releaseEscrowForOrder(orderId) {
  const escrow = findEscrowByOrder(orderId);
  if (!escrow || escrow.status !== 'HOLDING') return;

  const order = findOrderById(orderId);
  const supplier = findSupplierById(order.supplier_id);

  db.transaction(() => {
    updateEscrowStatus(escrow.id, { status: 'RELEASED', released_at: nowISO() });

    const commission = Number(order.platform_revenue) || escrow.amount_held * PLATFORM_COMMISSION_RATE;
    const supplierAmount = Number(order.supplier_net_amount) || escrow.amount_held - commission;

    createPayout({
      escrow_account_id: escrow.id,
      order_id: order.id,
      supplier_id: order.supplier_id,
      amount: supplierAmount,
      currency: order.currency,
      gateway_reference: `PO-${crypto.randomBytes(8).toString('hex')}`,
    });
  })();
}
