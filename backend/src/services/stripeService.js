import Stripe from 'stripe';
import db from '../config/database.js';
import { env } from '../config/env.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { findOrderById } from '../models/orderModel.js';
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

/** Create a Stripe Checkout session for an order and return its hosted URL. */
export async function createCheckoutSession(user, orderId) {
  if (!stripe) throw new ValidationError('Card payments are not configured');

  const order = findOrderById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  assertOwnsOrder(user, order, 'You can only pay for your own orders');

  if (!PAYABLE_STATUSES.includes(order.status)) {
    throw new ValidationError('This order can no longer be paid for');
  }

  const existing = findPaymentByOrder(orderId);
  if (existing?.status === 'COMPLETED') {
    throw new ValidationError('Order is already paid');
  }

  const currency = (order.currency || env.STRIPE.currency).toLowerCase();
  const ref = order.id.slice(0, 8).toUpperCase();
  const base = env.STRIPE.appBaseUrl;

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: `MediCare Hub — Order ${ref}` },
            unit_amount: toMinorUnits(order.total_amount),
          },
          quantity: 1,
        },
      ],
      metadata: { order_id: order.id, buyer_id: user.id },
      success_url: `${base}/hospital/orders/${order.id}?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/hospital/orders/${order.id}?stripe=cancel`,
    });
  } catch (err) {
    // Surface Stripe's own validation messages (e.g. amount below minimum) cleanly.
    throw new ValidationError(err?.raw?.message || err?.message || 'Could not start card payment');
  }

  // Track the pending payment + session so we can confirm it on return.
  // 'card' is the allowed gateway value; gateway_response marks it as Stripe.
  if (existing) {
    updatePaymentStatus(existing.id, { status: 'PENDING' });
    db.prepare('UPDATE payments SET gateway = ?, transaction_reference = ?, gateway_reference = ? WHERE id = ?')
      .run('card', session.id, session.payment_intent || '', existing.id);
  } else {
    createPayment({
      order_id: order.id,
      gateway: 'card',
      amount: order.total_amount,
      currency: order.currency,
      transaction_reference: session.id,
      gateway_reference: session.payment_intent || '',
    });
  }

  return { url: session.url, session_id: session.id, publishable_key: env.STRIPE.publishableKey };
}

/** Confirm a Checkout session on return; marks the order paid if Stripe says paid. */
export async function confirmCheckoutSession(user, sessionId) {
  if (!stripe) throw new ValidationError('Card payments are not configured');
  if (!sessionId) throw new ValidationError('session_id is required');

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const orderId = session.metadata?.order_id;
  const order = orderId ? findOrderById(orderId) : null;
  if (!order) throw new NotFoundError('Order not found');
  assertOwnsOrder(user, order, 'Access denied');

  const payment = findPaymentByOrder(order.id);
  const paid = session.payment_status === 'paid';

  if (paid && payment && payment.status !== 'COMPLETED') {
    db.transaction(() => {
      completePaymentInternal(payment.id, {
        gateway_reference: typeof session.payment_intent === 'string' ? session.payment_intent : '',
        gateway_response: { stripe: true, session_id: session.id, payment_status: session.payment_status },
      });
    })();
    void notifyPaymentCompleted(order.id);
  }

  const fresh = findPaymentByOrder(order.id);
  return {
    paid,
    order_status: findOrderById(order.id).status,
    payment_status: fresh?.status || 'PENDING',
  };
}
