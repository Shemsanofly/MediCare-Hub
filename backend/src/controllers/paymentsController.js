import { body } from 'express-validator';
import { initiatePayment, listPaymentsForUser, getPayment, handleWebhook } from '../services/paymentService.js';
import { createCheckoutSession, confirmCheckoutSession, isStripeEnabled } from '../services/stripeService.js';

export async function stripeConfig(req, res, next) {
  try {
    res.json({ enabled: isStripeEnabled() });
  } catch (error) {
    next(error);
  }
}

export const stripeCheckoutValidation = [body('order_id').isString().trim().notEmpty()];

export async function stripeCheckout(req, res, next) {
  try {
    const result = await createCheckoutSession(req.user, req.body.order_id);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export const stripeConfirmValidation = [body('session_id').isString().trim().notEmpty()];

export async function stripeConfirm(req, res, next) {
  try {
    const result = await confirmCheckoutSession(req.user, req.body.session_id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export const initiateValidation = [
  body('order_id').isString().trim().notEmpty(),
  body('payment_method').optional().isIn(['mpesa', 'airtel', 'mixx', 'halopesa', 'selcom', 'bank_transfer', 'card']),
  body('phone').optional().trim(),
];

export async function initiate(req, res, next) {
  try {
    const payment = initiatePayment(req.user, req.body);
    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
}

export async function list(req, res, next) {
  try {
    const payments = listPaymentsForUser(req.user, {
      limit: parseInt(req.query.limit || '50', 10),
      offset: parseInt(req.query.offset || '0', 10),
    });
    res.json({ results: payments });
  } catch (error) {
    next(error);
  }
}

export async function getOne(req, res, next) {
  try {
    res.json(getPayment(req.params.id, req.user));
  } catch (error) {
    next(error);
  }
}

export async function webhook(req, res, next) {
  try {
    const result = handleWebhook(req.params.gateway, req.body, req.headers, req.ip);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
