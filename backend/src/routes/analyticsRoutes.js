import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/analytics/', authenticate, (req, res) => res.json({ results: [] }));
router.get('/analytics/:id/', authenticate, (req, res) => res.json({ id: req.params.id }));
router.get('/analytics/platform/', authenticate, (req, res) => res.json({ results: [] }));
router.get('/analytics/supplier/', authenticate, (req, res) => res.json({ results: [] }));

export default router;
