import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/notifications/', authenticate, (req, res) => res.json({ results: [] }));
router.get('/notifications/:id/', authenticate, (req, res) => res.json({ id: req.params.id, read: false }));
router.patch('/notifications/:id/', authenticate, (req, res) => res.json({ id: req.params.id, read: true }));

export default router;
