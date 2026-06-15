import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  listMethods,
  initiate,
  initiateValidation,
  complete,
  status,
} from '../controllers/paymentSimulationController.js';

const router = Router();

router.get('/methods/', listMethods);
router.post('/initiate/', authenticate, initiateValidation, validate, initiate);
router.post('/:id/complete/', authenticate, complete);
router.get('/:id/status/', authenticate, status);

export default router;
