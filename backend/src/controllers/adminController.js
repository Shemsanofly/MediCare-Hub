import { body, query } from 'express-validator';
import {
  listAdminUsers,
  getAdminUser,
  updateAdminUser,
  deleteAdminUser,
  listAdminSuppliers,
  getAdminSupplier,
  verifySupplier,
  rejectSupplier,
  deleteAdminSupplier,
  listAdminProducts,
  getAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
  listAdminOrders,
  getAdminOrder,
} from '../services/adminService.js';

export const userQueryValidation = [
  query('search').optional().trim(),
  query('role').optional().isIn(['HOSPITAL', 'SUPPLIER', 'ADMIN']),
  query('is_active').optional().isIn(['true', 'false']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
];

export async function listUsers(req, res, next) {
  try {
    const users = listAdminUsers(req.query);
    res.json({ results: users });
  } catch (error) {
    next(error);
  }
}

export async function getUser(req, res, next) {
  try {
    res.json(getAdminUser(req.params.id));
  } catch (error) {
    next(error);
  }
}

export async function patchUser(req, res, next) {
  try {
    res.json(updateAdminUser(req.params.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function deleteUser(req, res, next) {
  try {
    deleteAdminUser(req.params.id, req.user.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export const supplierQueryValidation = [
  query('search').optional().trim(),
  query('status').optional().isIn(['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED']),
];

export async function listSuppliers(req, res, next) {
  try {
    const suppliers = listAdminSuppliers(req.query);
    res.json({ results: suppliers });
  } catch (error) {
    next(error);
  }
}

export async function getSupplier(req, res, next) {
  try {
    res.json(getAdminSupplier(req.params.id));
  } catch (error) {
    next(error);
  }
}

export async function verifySupplierHandler(req, res, next) {
  try {
    res.json(verifySupplier(req.params.id, req.user.id));
  } catch (error) {
    next(error);
  }
}

export async function rejectSupplierHandler(req, res, next) {
  try {
    res.json(rejectSupplier(req.params.id, req.user.id, req.body.reason));
  } catch (error) {
    next(error);
  }
}

export async function deleteSupplier(req, res, next) {
  try {
    deleteAdminSupplier(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export const productQueryValidation = [
  query('search').optional().trim(),
  query('category').optional().trim(),
  query('supplier').optional().trim(),
  query('is_active').optional().isIn(['true', 'false']),
];

export async function listProducts(req, res, next) {
  try {
    const products = listAdminProducts(req.query);
    res.json({ results: products });
  } catch (error) {
    next(error);
  }
}

export async function getProduct(req, res, next) {
  try {
    res.json(getAdminProduct(req.params.id));
  } catch (error) {
    next(error);
  }
}

export async function patchProduct(req, res, next) {
  try {
    res.json(updateAdminProduct(req.params.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function deleteProduct(req, res, next) {
  try {
    deleteAdminProduct(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export const orderQueryValidation = [
  query('status').optional().trim(),
  query('search').optional().trim(),
];

export async function listOrders(req, res, next) {
  try {
    const orders = listAdminOrders(req.query);
    res.json({ results: orders });
  } catch (error) {
    next(error);
  }
}

export async function getOrder(req, res, next) {
  try {
    res.json(getAdminOrder(req.params.id));
  } catch (error) {
    next(error);
  }
}
