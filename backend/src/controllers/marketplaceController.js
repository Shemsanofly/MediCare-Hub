import { body, param, query } from 'express-validator';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { findBatchById } from '../models/productModel.js';
import {
  getProductList,
  getProductDetail,
  getProductOffers,
  getCategories,
  createProductForSupplier,
  updateProductForSupplier,
  removeProduct,
  createBatchForProduct,
  updateBatchForProduct,
  removeBatch,
  getBatchesForProduct,
  serializeBatch,
  addProductImages,
  setProductImagePrimary,
  removeProductImage,
} from '../services/marketplaceService.js';
import { upload, getUploadUrl } from '../middleware/upload.js';

export const productListValidation = [
  query('search').optional().trim(),
  query('category').optional().trim(),
  query('supplier').optional().trim(),
  query('min_price').optional().isFloat(),
  query('max_price').optional().isFloat(),
  query('cold_chain_required').optional().isIn(['true', 'false']),
  query('in_stock').optional().isIn(['true', 'false']),
  query('valid_expiry').optional().isIn(['true', 'false']),
  query('sort').optional().isIn(['relevance', 'price', '-price', 'trust_score', '-trust_score', 'delivery_speed', '-delivery_speed']),
  query('cursor').optional().trim(),
  query('page_size').optional().isInt({ min: 1, max: 100 }),
];

export async function listProducts(req, res, next) {
  try {
    const result = getProductList(req.query);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getProduct(req, res, next) {
  try {
    const product = getProductDetail(req.params.id);
    res.json(product);
  } catch (error) {
    next(error);
  }
}

export async function getProductOffersHandler(req, res, next) {
  try {
    res.json(getProductOffers(req.params.id));
  } catch (error) {
    next(error);
  }
}

export async function listCategoriesHandler(req, res, next) {
  try {
    res.json({ results: getCategories() });
  } catch (error) {
    next(error);
  }
}

export const createProductValidation = [
  body('name').isString().trim().notEmpty(),
  body('category_id').optional().trim(),
  body('unit_of_measure').isString().trim().notEmpty(),
  body('price').isFloat({ min: 0 }),
  body('generic_name').optional().trim(),
  body('description').optional().trim(),
  body('minimum_order_quantity').optional().isInt({ min: 1 }),
];

export async function createProductHandler(req, res, next) {
  try {
    const product = createProductForSupplier(req.user, req.body);
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
}

export async function updateProductHandler(req, res, next) {
  try {
    const product = updateProductForSupplier(req.user, req.params.id, req.body);
    res.json(product);
  } catch (error) {
    next(error);
  }
}

export async function deleteProductHandler(req, res, next) {
  try {
    removeProduct(req.user, req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function listBatches(req, res, next) {
  try {
    const isSupplier = req.user?.role === 'SUPPLIER' || req.user?.role === 'ADMIN';
    const batches = getBatchesForProduct(req.params.product_id, isSupplier);
    res.json({ results: batches });
  } catch (error) {
    next(error);
  }
}

export const batchValidation = [
  body('batch_number').isString().trim().notEmpty(),
  body('expiry_date').isISO8601(),
  body('quantity').isInt({ min: 0 }),
  body('manufacturing_date').optional().isISO8601(),
  body('unit_cost').optional().isFloat({ min: 0 }),
  body('storage_conditions').optional().trim(),
  body('tmda_batch_cert_number').optional().trim(),
];

export async function createBatchHandler(req, res, next) {
  try {
    const batch = createBatchForProduct(req.user, req.params.product_id, req.body);
    res.status(201).json(batch);
  } catch (error) {
    next(error);
  }
}

export async function updateBatchHandler(req, res, next) {
  try {
    const batch = updateBatchForProduct(req.user, req.params.id, req.body);
    res.json(batch);
  } catch (error) {
    next(error);
  }
}

export async function deleteBatchHandler(req, res, next) {
  try {
    removeBatch(req.user, req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function getBatch(req, res, next) {
  try {
    const batch = findBatchById(req.params.id);
    if (!batch) throw new NotFoundError('Batch not found');
    const isSupplier = req.user?.role === 'SUPPLIER' || req.user?.role === 'ADMIN';
    res.json(serializeBatch(batch, isSupplier));
  } catch (error) {
    next(error);
  }
}

export async function uploadProductImage(req, res, next) {
  try {
    // Accept one or many files: multer.array populates req.files; fall back to
    // req.file for any single-file callers.
    const files = req.files?.length ? req.files : (req.file ? [req.file] : []);
    if (files.length === 0) throw new ValidationError('No image uploaded');
    const urls = files.map((f) => getUploadUrl(f.filename));
    const product = addProductImages(req.user, req.params.id, urls, Boolean(req.body.is_primary));
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
}

export async function setProductImagePrimaryHandler(req, res, next) {
  try {
    const product = setProductImagePrimary(req.user, req.params.id, req.params.image_id);
    res.json(product);
  } catch (error) {
    next(error);
  }
}

export async function deleteProductImageHandler(req, res, next) {
  try {
    removeProductImage(req.user, req.params.id, req.params.image_id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
