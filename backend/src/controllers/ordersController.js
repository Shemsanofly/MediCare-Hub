import { body } from 'express-validator';
import { getCart, addToCart, removeFromCart } from '../services/cartService.js';
import { checkout, getOrder, listMyOrders, transitionOrder, approveOrder, rejectOrder } from '../services/orderService.js';

export async function getCartHandler(req, res, next) {
  try {
    res.json(getCart(req.user.id));
  } catch (error) {
    next(error);
  }
}

export const cartItemValidation = [
  body('product_id').isString().trim().notEmpty(),
  body('quantity').isInt({ min: 1 }),
  body('batch_id').optional().trim(),
];

export async function addCartItem(req, res, next) {
  try {
    res.json(addToCart(req.user.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function removeCartItem(req, res, next) {
  try {
    res.json(removeFromCart(req.user.id, req.body));
  } catch (error) {
    next(error);
  }
}

export const checkoutValidation = [
  body('notes').optional().trim(),
  body('payment_terms').optional().isIn(['IMMEDIATE', 'NET30', 'NET60', 'NET90']),
  body('delivery_fee').optional().isFloat({ min: 0 }),
  body('tax_amount').optional().isFloat({ min: 0 }),
  body('lpo_number').optional().trim(),
];

export async function checkoutHandler(req, res, next) {
  try {
    const result = checkout(req.user, req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listOrders(req, res, next) {
  try {
    const orders = listMyOrders(req.user, {
      status: req.query.status,
      limit: parseInt(req.query.limit || '50', 10),
      offset: parseInt(req.query.offset || '0', 10),
    });
    res.json({ results: orders });
  } catch (error) {
    next(error);
  }
}

export async function getOrderHandler(req, res, next) {
  try {
    res.json(getOrder(req.params.id, req.user));
  } catch (error) {
    next(error);
  }
}

export const transitionValidation = [
  body('status').isIn(['ACCEPTED', 'REJECTED', 'APPROVED', 'CONFIRMED', 'PAID', 'PREPARING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'DISPUTED']),
  body('reason').optional().trim(),
];

export async function transitionHandler(req, res, next) {
  try {
    res.json(transitionOrder(req.params.id, req.user, req.body));
  } catch (error) {
    next(error);
  }
}

export async function approveHandler(req, res, next) {
  try {
    res.json(approveOrder(req.params.id, req.user));
  } catch (error) {
    next(error);
  }
}

export async function rejectHandler(req, res, next) {
  try {
    res.json(rejectOrder(req.params.id, req.user, req.body.reason));
  } catch (error) {
    next(error);
  }
}
