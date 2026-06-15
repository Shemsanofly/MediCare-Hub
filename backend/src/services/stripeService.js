import Stripe from 'stripe';
import db from '../config/database.js';
import { env } from '../config/env.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { findOrderById, findOrdersByCheckoutGroup } from '../models/orderModel.js';
import { findPaymentByOrder, createPayment, updatePaymentStatus } from '../models/paymentModel.js';
import { completePaymentInternal } from './paymentService.js';
import { notifyPaymentCompleted } from './emailService.js';

const stripe = env.STRIPE.secretKey ? new Stripe(env.STRIPE.secretKey) : null;

const PAYABLE_STATUSES = ['PENDING', 'ACCEPTED', 'APPROVED', 'CONFIRMED'];

export function isStripeEnabled() {
  return Boolean(stripe);
}

// Stripe expects amounts in the currency's smallest unit. TZS/USD are 2-decimal.
function toMinorUnits(amount) {
  return Math.round(parseFloat(amount) * 100);
}

function assertOwnsOrder(user, order, action) {
  if (order.organisation_id !== user.organisation?.id && user.role !== 'ADMIN') {
    throw new ForbiddenError(action || 'You can only access your own orders');
  }
}

function resolvePayableOrders(orderIdOrGroupId) {
  const order = findOrderById(orderIdOrGroupId);
  if (order) return [order];
  const groupedOrders = findOrdersByCheckoutGroup(orderIdOrGroupId);
  if (!groupedOrders.length) throw new NotFoundError('Order not found');
  return groupedOrders;
}

/** Create a Stripe Checkout session for an order and return its hosted URL. */
export async function createCheckoutSession(user, orderId) {
  if (!stripe) throw new ValidationError('Card payments are not configured');

  const orders = resolvePayableOrders(orderId);
  orders.forEach((order) => assertOwnsOrder(user, order, 'You can only pay for your own orders'));

  if (!orders.every((order) => PAYABLE_STATUSES.includes(order.status))) {
    throw new ValidationError('This order can no longer be paid for');
  }

  const existingPayments = orders.map((order) => findPaymentByOrder(order.id)).filter(Boolean);
  if (existingPayments.length === orders.length && existingPayments.every((payment) => payment.status === 'COMPLETED')) {
    throw new ValidationError('Order is already paid');
  }

  const firstOrder = orders[0];
  const totalAmount = orders.reduce((sum, order) => sum + Number(order.total_amount), 0);
  const currency = (firstOrder.currency || env.STRIPE.currency).toLowerCase();
  const ref = (orders.length > 1 ? orderId : firstOrder.id).slice(0, 8).toUpperCase();
  const base = env.STRIPE.appBaseUrl;
  const returnOrderId = orders.length > 1 ? orderId : firstOrder.id;

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: `MediCare Hub — Order ${ref}` },
            unit_amount: toMinorUnits(totalAmount),
          },
          quantity: 1,
        },
      ],
      metadata: {
        order_id: firstOrder.id,
        checkout_group_id: orders.length > 1 ? orderId : '',
        buyer_id: user.id,
      },
      success_url: `${base}/hospital/orders/${returnOrderId}?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/hospital/orders/${returnOrderId}?stripe=cancel`,
    });
  } catch (err) {
    // Surface Stripe's own validation messages (e.g. amount below minimum) cleanly.
    throw new ValidationError(err?.raw?.message || err?.message || 'Could not start card payment');
  }

  // Track the pending payment + session so we can confirm it on return.
  // 'card' is the allowed gateway value; gateway_response marks it as Stripe.
  orders.forEach((order, index) => {
    const existing = findPaymentByOrder(order.id);
    const transactionReference = orders.length > 1 ? `${session.id}-${index + 1}` : session.id;
    if (existing) {
      updatePaymentStatus(existing.id, { status: 'PENDING' });
      db.prepare('UPDATE payments SET gateway = ?, transaction_reference = ?, gateway_reference = ? WHERE id = ?')
        .run('card', transactionReference, session.payment_intent || '', existing.id);
    } else {
      createPayment({
        order_id: order.id,
        gateway: 'card',
        amount: order.total_amount,
        currency: order.currency,
        transaction_reference: transactionReference,
        gateway_reference: session.payment_intent || '',
      });
    }
  });

  return { url: session.url, session_id: session.id, publishable_key: env.STRIPE.publishableKey };
}

/** Confirm a Checkout session on return; marks the order paid if Stripe says paid. */
export async function confirmCheckoutSession(user, sessionId) {
  if (!stripe) throw new ValidationError('Card payments are not configured');
  if (!sessionId) throw new ValidationError('session_id is required');

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const checkoutGroupId = session.metadata?.checkout_group_id;
  const orderId = session.metadata?.order_id;
  const orders = checkoutGroupId ? findOrdersByCheckoutGroup(checkoutGroupId) : orderId ? [findOrderById(orderId)].filter(Boolean) : [];
  if (!orders.length) throw new NotFoundError('Order not found');
  orders.forEach((order) => assertOwnsOrder(user, order, 'Access denied'));

  const paid = session.payment_status === 'paid';

  if (paid) {
    db.transaction(() => {
      for (const order of orders) {
        const payment = findPaymentByOrder(order.id);
        if (payment && payment.status !== 'COMPLETED') {
          completePaymentInternal(payment.id, {
            gateway_reference: typeof session.payment_intent === 'string' ? session.payment_intent : '',
            gateway_response: { stripe: true, session_id: session.id, payment_status: session.payment_status },
          });
        }
      }
    })();
    orders.forEach((order) => void notifyPaymentCompleted(order.id));
  }

  const freshPayments = orders.map((order) => findPaymentByOrder(order.id)).filter(Boolean);
  const allPaid = freshPayments.length === orders.length && freshPayments.every((payment) => payment.status === 'COMPLETED');
  return {
    paid,
    order_status: orders.length > 1 ? 'PAID' : findOrderById(orders[0].id).status,
    payment_status: allPaid ? 'COMPLETED' : freshPayments[0]?.status || 'PENDING',
  };
}
