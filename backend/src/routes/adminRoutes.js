import { Router } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  listUsers,
  getUser,
  patchUser,
  deleteUser,
  userQueryValidation,
  listSuppliers,
  getSupplier,
  verifySupplierHandler,
  rejectSupplierHandler,
  deleteSupplier,
  supplierQueryValidation,
  listProducts,
  getProduct,
  patchProduct,
  deleteProduct,
  productQueryValidation,
  listOrders,
  getOrder,
  orderQueryValidation,
} from '../controllers/adminController.js';

const router = Router();

router.get('/users/', authenticate, requireRoles('ADMIN'), userQueryValidation, validate, listUsers);
router.get('/users/:id/', authenticate, requireRoles('ADMIN'), getUser);
router.patch('/users/:id/', authenticate, requireRoles('ADMIN'), patchUser);
router.delete('/users/:id/', authenticate, requireRoles('ADMIN'), deleteUser);

router.get('/suppliers/', authenticate, requireRoles('ADMIN'), supplierQueryValidation, validate, listSuppliers);
router.get('/suppliers/:id/', authenticate, requireRoles('ADMIN'), getSupplier);
router.post('/suppliers/:id/verify/', authenticate, requireRoles('ADMIN'), verifySupplierHandler);
router.patch('/suppliers/:id/verify/', authenticate, requireRoles('ADMIN'), verifySupplierHandler);
router.post('/suppliers/:id/reject/', authenticate, requireRoles('ADMIN'), rejectSupplierHandler);
router.patch('/suppliers/:id/reject/', authenticate, requireRoles('ADMIN'), rejectSupplierHandler);
router.delete('/suppliers/:id/', authenticate, requireRoles('ADMIN'), deleteSupplier);

router.get('/products/', authenticate, requireRoles('ADMIN'), productQueryValidation, validate, listProducts);
router.get('/products/:id/', authenticate, requireRoles('ADMIN'), getProduct);
router.patch('/products/:id/', authenticate, requireRoles('ADMIN'), patchProduct);
router.delete('/products/:id/', authenticate, requireRoles('ADMIN'), deleteProduct);

router.get('/orders/', authenticate, requireRoles('ADMIN'), orderQueryValidation, validate, listOrders);
router.get('/orders/:id/', authenticate, requireRoles('ADMIN'), getOrder);

export default router;
