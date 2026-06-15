import { Router } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { hospitalSummary, supplierSummary, adminSummary } from '../controllers/dashboardController.js';

const router = Router();

router.get('/hospital/summary/', authenticate, requireRoles('HOSPITAL', 'ADMIN'), hospitalSummary);
router.get('/supplier/summary/', authenticate, requireRoles('SUPPLIER', 'ADMIN'), supplierSummary);
router.get('/admin/summary/', authenticate, requireRoles('ADMIN'), adminSummary);

export default router;
