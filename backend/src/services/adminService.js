import db from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import { normalizeUser } from '../middleware/auth.js';
import { findUserById, setUserActive, setUserVerified } from '../models/userModel.js';
import { findSupplierById, updateSupplierVerification, listSuppliers, countSuppliers } from '../models/supplierModel.js';
import { findProductById, updateProduct, deleteProduct } from '../models/productModel.js';
import { findOrderById, listAllOrders } from '../models/orderModel.js';
import { serializeOrder } from '../services/orderService.js';
import { getProductDetail } from './marketplaceService.js';
import { cascadeDeleteUser, cascadeDeleteSupplier, deleteSupplierFiles } from './cascadeService.js';

export function listAdminUsers({ search = '', role = '', is_active = '', limit = 50, offset = 0 } = {}) {
  let sql = `
    SELECT u.*, o.name as organisation_name, o.type as organisation_type
    FROM users u
    LEFT JOIN organisations o ON o.id = u.organisation_id
    WHERE 1=1
  `;
  const params = [];
  if (search) {
    sql += ` AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (role) {
    sql += ` AND u.role = ?`;
    params.push(role);
  }
  if (is_active !== '') {
    sql += ` AND u.is_active = ?`;
    params.push(is_active === 'true' || is_active === true ? 1 : 0);
  }
  sql += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params);
  return rows.map((u) => ({
    ...normalizeUser(u),
    organisation_name: u.organisation_name,
  }));
}

export function getAdminUser(id) {
  const user = findUserById(id);
  if (!user) throw new NotFoundError('User not found');
  return normalizeUser(user);
}

export function updateAdminUser(id, { is_active, is_verified }) {
  let user = findUserById(id);
  if (!user) throw new NotFoundError('User not found');
  if (typeof is_active === 'boolean') user = setUserActive(id, is_active);
  if (typeof is_verified === 'boolean') user = setUserVerified(id, is_verified);
  return normalizeUser(findUserById(id));
}

export function deleteAdminUser(id, adminUserId) {
  const user = findUserById(id);
  if (!user) throw new NotFoundError('User not found');
  if (id === adminUserId) {
    throw new ForbiddenError('You cannot delete your own admin account');
  }

  const remove = db.transaction(() => {
    cascadeDeleteUser(id);
  });
  remove();
}

export function listAdminSuppliers({ search = '', status = '', limit = 50, offset = 0 } = {}) {
  const suppliers = listSuppliers({ search, status, limit, offset });
  return suppliers.map((s) => ({
    id: s.id,
    organisation_name: s.organisation_name,
    brela_registration_number: s.brela_registration_number || '',
    tmda_license_number: s.tmda_license_number || '',
    license_expiry_date: s.license_expiry_date,
    verification_status: s.verification_status,
    rejection_reason: s.rejection_reason || '',
    created_at: s.created_at,
    has_required_documents: Boolean(
      s.brela_registration_number && s.tmda_license_number
    ),
  }));
}

export function getAdminSupplier(id) {
  const supplier = findSupplierById(id);
  if (!supplier) throw new NotFoundError('Supplier not found');
  const org = db.prepare('SELECT * FROM organisations WHERE id = ?').get(supplier.organisation_id);
  return {
    id: supplier.id,
    organisation_name: org?.name || '',
    brela_registration_number: supplier.brela_registration_number || '',
    tmda_license_number: supplier.tmda_license_number || '',
    license_expiry_date: supplier.license_expiry_date,
    verification_status: supplier.verification_status,
    rejection_reason: supplier.rejection_reason || '',
    created_at: supplier.created_at,
    has_required_documents: Boolean(
      supplier.brela_registration_number && supplier.tmda_license_number
    ),
  };
}

export function verifySupplier(id, adminId) {
  const supplier = updateSupplierVerification(id, {
    verification_status: 'VERIFIED',
    verified_by: adminId,
    verified_at: new Date().toISOString(),
    rejection_reason: null,
  });
  if (!supplier) throw new NotFoundError('Supplier not found');
  return getAdminSupplier(supplier.id);
}

export function rejectSupplier(id, adminId, reason) {
  const supplier = updateSupplierVerification(id, {
    verification_status: 'REJECTED',
    verified_by: adminId,
    verified_at: new Date().toISOString(),
    rejection_reason: reason || 'Rejected by admin',
  });
  if (!supplier) throw new NotFoundError('Supplier not found');
  return getAdminSupplier(supplier.id);
}

export function deleteAdminSupplier(id) {
  const supplier = findSupplierById(id);
  if (!supplier) throw new NotFoundError('Supplier not found');

  let filesToDelete;
  const remove = db.transaction(() => {
    filesToDelete = cascadeDeleteSupplier(id);
  });
  remove();

  if (filesToDelete) {
    deleteSupplierFiles(filesToDelete);
  }
}

export function listAdminProducts({ search = '', category = '', supplier = '', stock_status = '', is_active = '', limit = 50, offset = 0 } = {}) {
  let sql = `
    SELECT p.*, o.name as supplier_name
    FROM products p
    JOIN suppliers s ON s.id = p.supplier_id
    JOIN organisations o ON o.id = s.organisation_id
    WHERE 1=1
  `;
  const params = [];
  if (search) {
    sql += ` AND (p.name LIKE ? OR p.generic_name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  if (category) {
    sql += ` AND p.category_id = ?`;
    params.push(category);
  }
  if (supplier) {
    sql += ` AND p.supplier_id = ?`;
    params.push(supplier);
  }
  if (is_active !== '') {
    sql += ` AND p.is_active = ?`;
    params.push(is_active === 'true' || is_active === true ? 1 : 0);
  }

  sql += ` ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params);
  return rows.map((p) => getProductDetail(p.id));
}

export function getAdminProduct(id) {
  return getProductDetail(id);
}

export function updateAdminProduct(id, { is_active }) {
  const product = findProductById(id);
  if (!product) throw new NotFoundError('Product not found');
  const updated = updateProduct(id, { is_active });
  return getProductDetail(updated.id);
}

export function deleteAdminProduct(id) {
  const product = findProductById(id);
  if (!product) throw new NotFoundError('Product not found');
  deleteProduct(id);
}

export function listAdminOrders({ status = '', search = '', limit = 50, offset = 0 } = {}) {
  const orders = listAllOrders({ status, search, limit, offset });
  return orders.map(serializeOrder);
}

export function getAdminOrder(id) {
  const order = findOrderById(id);
  if (!order) throw new NotFoundError('Order not found');
  return serializeOrder(order);
}
