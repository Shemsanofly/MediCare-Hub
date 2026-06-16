import crypto from 'crypto';
import db from '../config/database.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors.js';
import { findOrderById, findOrdersByCheckoutGroup } from '../models/orderModel.js';
import { findPaymentById, findPaymentByOrder, createPayment, updatePaymentStatus, createEscrow, findEscrowByOrder } from '../models/paymentModel.js';
import { formatDecimal, nowISO } from '../utils/helpers.js';
import { completePaymentInternal } from './paymentService.js';
import { notifyPaymentCompleted } from './emailService.js';

export const SUPPORTED_METHODS = [
  { id: 'mpesa', name: 'M-Pesa', color: '#00A650', prefix: '+255', network: 'Vodacom' },
  { id: 'airtel', name: 'Airtel Money', color: '#E31B23', prefix: '+255', network: 'Airtel' },
  { id: 'mixx', name: 'Mixx by Yas', color: '#FFD600', prefix: '+255', network: 'Yas' },
  { id: 'halopesa', name: 'HaloPesa', color: '#F36F21', prefix: '+255', network: 'Halotel' },
  { id: 'selcom', name: 'Selcom', color: '#1E3A8A', prefix: '+255', network: 'Selcom' },
  { id: 'card', name: 'Card', color: '#2563EB', prefix: '', network: 'Visa/Mastercard' },
  { id: 'bank_transfer', name: 'Bank Transfer', color: '#475569', prefix: '', network: 'Bank' },
];

export function getPaymentMethods() {
  return SUPPORTED_METHODS;
}

export function getPaymentMethod(methodId) {
  return SUPPORTED_METHODS.find((m) => m.id === methodId);
}

export function initiateSimulation(user, { order_id, payment_method, phone }) {
  const orders = resolvePayableOrders(order_id);
  const order = orders[0];

  if (!orders.every((o) => o.organisation_id === user.organisation?.id) && user.role !== 'ADMIN') {
    throw new ForbiddenError('You can only pay for your own orders');
  }

  if (!orders.every((o) => ['PENDING', 'ACCEPTED', 'APPROVED', 'CONFIRMED'].includes(o.status))) {
    throw new ValidationError('This order can no longer be paid for');
  }

  const method = getPaymentMethod(payment_method);
  if (!method) throw new ValidationError('Unsupported payment method');

  const existingPayments = orders.map((o) => findPaymentByOrder(o.id)).filter(Boolean);
  if (existingPayments.length === orders.length && existingPayments.every((p) => p.status === 'COMPLETED')) {
    throw new ValidationError('Order is already paid');
  }

  const totalAmount = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const displayOrderId = orders.length > 1 ? order_id : order.id;

  if (existingPayments.length) {
    // Reset existing pending/processing payment to new simulation
    const groupReference = existingPayments[0].gateway_reference || `GW-${crypto.randomBytes(8).toString('hex')}`;
    existingPayments.forEach((payment) => updatePaymentStatus(payment.id, { status: 'PENDING', gateway_reference: groupReference }));
    return buildSimulationResponse({ ...existingPayments[0], order_id: displayOrderId, amount: totalAmount }, method, phone);
  }

  const gatewayReference = `GW-${crypto.randomBytes(8).toString('hex')}`;
  const baseReference = `SIM-${displayOrderId}-${crypto.randomBytes(4).toString('hex')}`;

  const payments = orders.map((payableOrder, index) =>
    createPayment({
      order_id: payableOrder.id,
      gateway: payment_method,
      amount: payableOrder.total_amount,
      currency: payableOrder.currency,
      transaction_reference: orders.length > 1 ? `${baseReference}-${index + 1}` : baseReference,
      gateway_reference: gatewayReference,
    }),
  );

  return buildSimulationResponse({ ...payments[0], order_id: displayOrderId, amount: totalAmount }, method, phone);
}

function resolvePayableOrders(orderIdOrGroupId) {
  const order = findOrderById(orderIdOrGroupId);
  if (order) return [order];
  const groupedOrders = findOrdersByCheckoutGroup(orderIdOrGroupId);
  if (!groupedOrders.length) throw new NotFoundError('Order not found');
  return groupedOrders;
}

function buildSimulationResponse(payment, method, phone) {
  const normalizedPhone = normalizePhone(phone, method.prefix);
  const instructions = generateInstructions(method, normalizedPhone, payment);

  return {
    payment: serializeSimulatedPayment(payment),
    simulation: {
      method_id: method.id,
      method_name: method.name,
      network: method.network,
      phone: normalizedPhone,
      instructions,
      simulated: true,
      can_complete: true,
    },
  };
}

function normalizePhone(phone, prefix) {
  if (!phone) return `${prefix}7XX XXX XXX`;
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
  if (prefix && !cleaned.startsWith(prefix.replace('+', ''))) {
    cleaned = `${prefix.replace('+', '')}${cleaned}`;
  }
  return `+${cleaned}`;
}

function generateInstructions(method, phone, payment) {
  const amount = formatDecimal(payment.amount);
  switch (method.id) {
    case 'mpesa':
      return [
        `A push request has been sent to ${phone}.`,
        `Please enter your M-Pesa PIN on your phone to authorize TZS ${amount}.`,
        `Transaction reference: ${payment.transaction_reference}`,
      ];
    case 'airtel':
      return [
        `An Airtel Money prompt has been sent to ${phone}.`,
        `Please confirm the payment of TZS ${amount} on your phone.`,
        `Transaction reference: ${payment.transaction_reference}`,
      ];
    case 'mixx':
      return [
        `A Mixx by Yas payment request has been sent to ${phone}.`,
        `Please approve TZS ${amount} in your Mixx app.`,
        `Transaction reference: ${payment.transaction_reference}`,
      ];
    case 'halopesa':
      return [
        `A HaloPesa prompt has been sent to ${phone}.`,
        `Please enter your HaloPesa PIN to pay TZS ${amount}.`,
        `Transaction reference: ${payment.transaction_reference}`,
      ];
    case 'selcom':
      return [
        `Selcom payment page opened.`,
        `Complete the payment of TZS ${amount} to continue.`,
        `Transaction reference: ${payment.transaction_reference}`,
      ];
    case 'card':
      return [
        `Card payment form ready.`,
        `Enter your Visa/Mastercard details to pay TZS ${amount}.`,
        `Transaction reference: ${payment.transaction_reference}`,
      ];
    case 'bank_transfer':
      return [
        `Bank transfer instructions generated.`,
        `Transfer TZS ${amount} using the reference ${payment.transaction_reference}.`,
        `Mark payment as complete once the transfer is confirmed.`,
      ];
    default:
      return [`Payment simulation for ${method.name}. Amount: TZS ${amount}`];
  }
}

export function completeSimulation(user, paymentId) {
  const payment = findPaymentById(paymentId);
  if (!payment) throw new NotFoundError('Payment not found');

  const order = findOrderById(payment.order_id);
  if (order.organisation_id !== user.organisation?.id && user.role !== 'ADMIN') {
    throw new ForbiddenError('You can only complete your own payments');
  }

  if (payment.status === 'COMPLETED') {
    return { payment: serializeSimulatedPayment(payment), already_completed: true };
  }

  const relatedPayments = payment.gateway_reference
    ? db.prepare('SELECT * FROM payments WHERE gateway_reference = ?').all(payment.gateway_reference)
    : [payment];

  db.transaction(() => {
    for (const relatedPayment of relatedPayments) {
      completePaymentInternal(relatedPayment.id, {
        gateway_reference: relatedPayment.gateway_reference,
        gateway_response: {
          simulated: true,
          method: relatedPayment.gateway,
          completed_at: nowISO(),
        },
      });
    }
  })();

  relatedPayments.forEach((relatedPayment) => void notifyPaymentCompleted(relatedPayment.order_id));

  return {
    payment: serializeSimulatedPayment({
      ...findPaymentById(paymentId),
      amount: relatedPayments.reduce((sum, p) => sum + Number(p.amount), 0),
      order_id: relatedPayments.length > 1 ? order.checkout_group_id : order.id,
    }),
    order_status: 'PAID',
  };
}

export function getSimulationStatus(paymentId, user) {
  const payment = findPaymentById(paymentId);
  if (!payment) throw new NotFoundError('Payment not found');

  const order = findOrderById(payment.order_id);
  if (order.organisation_id !== user.organisation?.id && user.role !== 'ADMIN') {
    throw new ForbiddenError('Access denied');
  }

  return {
    payment: serializeSimulatedPayment(payment),
    order_status: order.status,
  };
}

export function serializeSimulatedPayment(payment) {
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
