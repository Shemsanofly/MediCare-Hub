import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  initiate,
  initiateValidation,
  list,
  getOne,
  webhook,
  stripeConfig,
  stripeCheckout,
  stripeCheckoutValidation,
  stripeConfirm,
  stripeConfirmValidation,
} from '../controllers/paymentsController.js';

const router = Router();

router.get('/payments/', authenticate, list);
router.get('/stripe/config/', stripeConfig);
router.post('/stripe/checkout/', authenticate, stripeCheckoutValidation, validate, stripeCheckout);
router.post('/stripe/confirm/', authenticate, stripeConfirmValidation, validate, stripeConfirm);
router.get('/payments/:id/', authenticate, getOne);
router.post('/payments/initiate/', authenticate, initiateValidation, validate, initiate);
router.post('/webhooks/:gateway/', webhook);

export default router;
