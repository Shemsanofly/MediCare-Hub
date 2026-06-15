import { Router } from 'express';
import {
  listProducts,
  productListValidation,
  getProduct,
  getProductOffersHandler,
  listCategoriesHandler,
  createProductHandler,
  createProductValidation,
  updateProductHandler,
  deleteProductHandler,
  listBatches,
  createBatchHandler,
  batchValidation,
  updateBatchHandler,
  deleteBatchHandler,
  getBatch,
  uploadProductImage,
  setProductImagePrimaryHandler,
  deleteProductImageHandler,
} from '../controllers/marketplaceController.js';
import { authenticate, optionalAuth, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { upload } from '../middleware/upload.js';

const router = Router();

router.get('/products/', productListValidation, validate, listProducts);
router.get('/products/:id/', getProduct);
router.get('/products/:id/offers/', optionalAuth, getProductOffersHandler);
router.post('/products/', authenticate, requireRoles('SUPPLIER', 'ADMIN'), createProductValidation, validate, createProductHandler);
router.patch('/products/:id/', authenticate, requireRoles('SUPPLIER', 'ADMIN'), createProductValidation, validate, updateProductHandler);
router.delete('/products/:id/', authenticate, requireRoles('SUPPLIER', 'ADMIN'), deleteProductHandler);
router.get('/products/:product_id/batches/', optionalAuth, listBatches);
router.post('/products/:product_id/batches/', authenticate, requireRoles('SUPPLIER', 'ADMIN'), batchValidation, validate, createBatchHandler);
router.get('/batches/:id/', authenticate, requireRoles('SUPPLIER', 'ADMIN'), getBatch);
router.patch('/batches/:id/', authenticate, requireRoles('SUPPLIER', 'ADMIN'), batchValidation, validate, updateBatchHandler);
router.delete('/batches/:id/', authenticate, requireRoles('SUPPLIER', 'ADMIN'), deleteBatchHandler);
router.post('/products/:id/images/', authenticate, requireRoles('SUPPLIER', 'ADMIN'), upload.array('images', 8), uploadProductImage);
router.patch('/products/:id/images/:image_id/primary/', authenticate, requireRoles('SUPPLIER', 'ADMIN'), setProductImagePrimaryHandler);
router.delete('/products/:id/images/:image_id/', authenticate, requireRoles('SUPPLIER', 'ADMIN'), deleteProductImageHandler);
router.get('/categories/', listCategoriesHandler);

export default router;
