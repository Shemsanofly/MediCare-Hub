import { Router } from 'express';
import { body } from 'express-validator';
import {
  getCartHandler,
  addCartItem,
  cartItemValidation,
  removeCartItem,
  checkoutHandler,
  checkoutValidation,
  listOrders,
  getOrderHandler,
  transitionHandler,
  transitionValidation,
  approveHandler,
  rejectHandler,
} from '../controllers/ordersController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/cart/', authenticate, getCartHandler);
router.post('/cart/', authenticate, cartItemValidation, validate, addCartItem);
router.delete('/cart/', authenticate, body('product_id').isString().trim(), validate, removeCartItem);
router.post('/checkout/', authenticate, checkoutValidation, validate, checkoutHandler);

// General order endpoints expected under /orders/orders/ in the frontend
router.get('/orders/', authenticate, listOrders);
router.get('/orders/:id/', authenticate, getOrderHandler);
router.post('/orders/:id/approve/', authenticate, approveHandler);
router.post('/orders/:id/reject/', authenticate, body('reason').optional().trim(), validate, rejectHandler);
router.post('/orders/:id/transition/', authenticate, transitionValidation, validate, transitionHandler);
router.post('/orders/:id/process/', authenticate, (req, res, next) => {
  req.body = { status: 'PROCESSING', reason: req.body.reason };
  transitionHandler(req, res, next);
});

// Supplier/buyer lifecycle transitions expected at /orders/<id>/<action>/
router.post('/:id/accept/', authenticate, (req, res, next) => {
  req.body = { status: 'ACCEPTED', reason: req.body.reason };
  transitionHandler(req, res, next);
});
router.post('/:id/reject/', authenticate, body('reason').optional().trim(), validate, (req, res, next) => {
  req.body = { status: 'REJECTED', reason: req.body.reason };
  transitionHandler(req, res, next);
});
router.post('/:id/prepare/', authenticate, (req, res, next) => {
  req.body = { status: 'PREPARING', reason: req.body.reason };
  transitionHandler(req, res, next);
});
router.post('/:id/ship/', authenticate, (req, res, next) => {
  req.body = { status: 'SHIPPED', reason: req.body.reason };
  transitionHandler(req, res, next);
});
router.post('/:id/deliver/', authenticate, (req, res, next) => {
  req.body = { status: 'DELIVERED', reason: req.body.reason };
  transitionHandler(req, res, next);
});
router.post('/:id/complete/', authenticate, (req, res, next) => {
  req.body = { status: 'COMPLETED', reason: req.body.reason };
  transitionHandler(req, res, next);
});

export default router;
