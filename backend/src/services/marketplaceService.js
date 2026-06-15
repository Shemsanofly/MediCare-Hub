import db from '../config/database.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import {
  findProductById,
  findProductOffers,
  listCategories,
  findCategoryById,
  createProduct,
  updateProduct,
  deleteProduct,
  createBatch,
  findBatchById,
  updateBatch,
  deleteBatch,
  findBatchesByProduct,
  getTotalAvailableQuantity,
  findProductImages,
  findProductImageById,
  createProductImage,
  deleteProductImage,
  setPrimaryImage,
} from '../models/productModel.js';
import { findSupplierById, findSupplierByOrganisationId } from '../models/supplierModel.js';
import { formatDecimal } from '../utils/helpers.js';

export function serializeProduct(product, includeBatches = false, isSupplierView = false) {
  const supplier = db.prepare(`
    SELECT s.*, o.name as organisation_name
    FROM suppliers s
    JOIN organisations o ON o.id = s.organisation_id
    WHERE s.id = ?
  `).get(product.supplier_id);

  const category = product.category_id ? findCategoryById(product.category_id) : null;
  const batches = includeBatches ? findBatchesByProduct(product.id).map((b) => serializeBatch(b, isSupplierView)) : [];
  const totalQuantity = getTotalAvailableQuantity(product.id);
  const images = findProductImages(product.id).map((img) => ({
    id: img.id,
    url: img.file_path,
    is_primary: Boolean(img.is_primary),
    uploaded_at: img.uploaded_at,
  }));

  let inventoryStatus = 'ACTIVE';
  if (totalQuantity === 0) inventoryStatus = 'OUT_OF_STOCK';
  else if (totalQuantity < 20) inventoryStatus = 'LOW_STOCK';

  return {
    id: product.id,
    name: product.name,
    generic_name: product.generic_name || '',
    gtin: product.gtin || '',
    description: product.description || '',
    unit_of_measure: product.unit_of_measure,
    price: formatDecimal(product.price),
    currency: product.currency,
    minimum_order_quantity: product.minimum_order_quantity,
    is_cold_chain_required: Boolean(product.is_cold_chain_required),
    temperature_range_min: product.temperature_range_min ? String(product.temperature_range_min) : null,
    temperature_range_max: product.temperature_range_max ? String(product.temperature_range_max) : null,
    tmda_registration_number: product.tmda_registration_number || '',
    is_active: Boolean(product.is_active),
    image_url: product.image_url || (images.find((i) => i.is_primary)?.url) || (images[0]?.url) || null,
    images,
    category: category ? serializeCategory(category) : null,
    supplier: supplier
      ? {
          id: supplier.id,
          organisation_name: supplier.organisation_name,
          supplier_rating: supplier.trust_score,
          trust_score: supplier.trust_score,
          average_delivery_days: String(supplier.average_delivery_days),
          verification_status: supplier.verification_status,
        }
      : null,
    batches,
    total_quantity_available: totalQuantity,
    inventory_status: inventoryStatus,
    created_at: product.created_at,
    updated_at: product.updated_at,
  };
}

export function serializeBatch(batch, isSupplierView = false) {
  const now = new Date();
  const expiry = new Date(batch.expiry_date);
  const available = batch.quantity - batch.reserved_quantity;
  let status = 'ACTIVE';
  if (expiry < now) status = 'EXPIRED';
  else if (available === 0) status = 'OUT_OF_STOCK';
  else if (available < 20) status = 'LOW_STOCK';

  const base = {
    id: batch.id,
    batch_number: batch.batch_number,
    expiry_date: batch.expiry_date,
    available_quantity: Math.max(available, 0),
    status,
    storage_conditions: batch.storage_conditions || '',
    tmda_batch_cert_number: batch.tmda_batch_cert_number || '',
    created_at: batch.created_at,
  };

  if (batch.manufacture_date) {
    base.manufacturing_date = batch.manufacture_date;
    base.manufacture_date = batch.manufacture_date;
  }

  if (isSupplierView) {
    base.quantity = batch.quantity;
    base.reserved_quantity = batch.reserved_quantity;
    base.unit_cost = batch.unit_cost ? formatDecimal(batch.unit_cost) : null;
    base.updated_at = batch.updated_at;
  }

  return base;
}

export function serializeCategory(category) {
  return {
    id: category.id,
    name: category.name,
    parent: category.parent_id,
    is_regulated: Boolean(category.is_regulated),
    tmda_required: Boolean(category.tmda_required),
  };
}

export function getProductList({ search, category, supplier, min_price, max_price, cold_chain_required, in_stock, valid_expiry, sort, cursor, page_size = 20 }) {
  let sql = `
    SELECT p.* FROM products p
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.is_active = 1 AND s.verification_status = 'VERIFIED'
  `;
  const params = [];

  if (search) {
    sql += ` AND (p.name LIKE ? OR p.generic_name LIKE ? OR p.description LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (category) {
    sql += ` AND p.category_id = ?`;
    params.push(category);
  }
  if (supplier) {
    sql += ` AND p.supplier_id = ?`;
    params.push(supplier);
  }
  if (min_price !== undefined && min_price !== '') {
    sql += ` AND p.price >= ?`;
    params.push(parseFloat(min_price));
  }
  if (max_price !== undefined && max_price !== '') {
    sql += ` AND p.price <= ?`;
    params.push(parseFloat(max_price));
  }
  if (cold_chain_required === 'true' || cold_chain_required === true) {
    sql += ` AND p.is_cold_chain_required = 1`;
  }
  if (in_stock === 'true' || in_stock === true) {
    sql += ` AND (SELECT COALESCE(SUM(quantity - reserved_quantity), 0) FROM product_batches WHERE product_id = p.id AND expiry_date > date('now')) > 0`;
  }
  if (valid_expiry === 'true' || valid_expiry === true) {
    sql += ` AND EXISTS (SELECT 1 FROM product_batches WHERE product_id = p.id AND expiry_date > date('now'))`;
  }

  if (cursor) {
    sql += ` AND p.created_at < ?`;
    params.push(cursor);
  }

  let orderBy = 'p.created_at DESC';
  if (sort === 'price') orderBy = 'p.price ASC';
  else if (sort === '-price') orderBy = 'p.price DESC';
  else if (sort === 'trust_score') orderBy = 's.trust_score ASC';
  else if (sort === '-trust_score') orderBy = 's.trust_score DESC';
  else if (sort === 'delivery_speed') orderBy = 's.average_delivery_days ASC';
  else if (sort === '-delivery_speed') orderBy = 's.average_delivery_days DESC';

  sql += ` ORDER BY ${orderBy} LIMIT ?`;
  params.push(parseInt(page_size, 10) + 1);

  const rows = db.prepare(sql).all(...params);
  const hasMore = rows.length > page_size;
  const results = hasMore ? rows.slice(0, page_size) : rows;

  return {
    results: results.map((p) => serializeProduct(p, true, false)),
    page_size: parseInt(page_size, 10),
    next: hasMore ? results[results.length - 1]?.created_at : null,
  };
}

export function getProductDetail(id) {
  const product = findProductById(id);
  if (!product) throw new NotFoundError('Product not found');
  return serializeProduct(product, true, false);
}

/**
 * Return the list of supplier offers for the same product, so a buyer can
 * compare price and supplier rating side by side. Each offer is a distinct,
 * supplier-specific product row that can be added to the cart directly.
 */
export function getProductOffers(id) {
  const product = findProductById(id);
  if (!product) throw new NotFoundError('Product not found');

  const offers = findProductOffers(product).map((p) => {
    const supplier = db.prepare(`
      SELECT s.*, o.name as organisation_name
      FROM suppliers s
      JOIN organisations o ON o.id = s.organisation_id
      WHERE s.id = ?
    `).get(p.supplier_id);

    const totalQuantity = getTotalAvailableQuantity(p.id);
    let inventoryStatus = 'ACTIVE';
    if (totalQuantity === 0) inventoryStatus = 'OUT_OF_STOCK';
    else if (totalQuantity < 20) inventoryStatus = 'LOW_STOCK';

    const images = findProductImages(p.id);

    return {
      product_id: p.id,
      is_current: p.id === product.id,
      price: formatDecimal(p.price),
      currency: p.currency,
      minimum_order_quantity: p.minimum_order_quantity,
      total_quantity_available: totalQuantity,
      inventory_status: inventoryStatus,
      in_stock: totalQuantity > 0,
      image_url:
        p.image_url ||
        images.find((i) => i.is_primary)?.file_path ||
        images[0]?.file_path ||
        null,
      supplier: supplier
        ? {
            id: supplier.id,
            organisation_name: supplier.organisation_name,
            supplier_rating: supplier.trust_score,
            trust_score: supplier.trust_score,
            average_delivery_days: String(supplier.average_delivery_days),
            verification_status: supplier.verification_status,
          }
        : null,
    };
  });

  // Cheapest first.
  offers.sort((a, b) => Number(a.price) - Number(b.price));

  // Highlight the best option on each dimension buyers care about.
  if (offers.length > 0) {
    const lowestPrice = Math.min(...offers.map((o) => Number(o.price)));
    const highestRating = Math.max(...offers.map((o) => o.supplier?.trust_score ?? 0));
    const fastestDelivery = Math.min(
      ...offers.map((o) => Number(o.supplier?.average_delivery_days ?? Infinity))
    );
    for (const o of offers) {
      o.is_lowest_price = Number(o.price) === lowestPrice;
      o.is_highest_rated = (o.supplier?.trust_score ?? 0) === highestRating;
      o.is_fastest_delivery =
        Number(o.supplier?.average_delivery_days ?? Infinity) === fastestDelivery;
    }
  }

  return {
    product: {
      id: product.id,
      name: product.name,
      generic_name: product.generic_name || '',
      gtin: product.gtin || '',
      unit_of_measure: product.unit_of_measure,
    },
    offer_count: offers.length,
    offers,
  };
}

export function getCategories() {
  const all = listCategories();
  const parents = all.filter((c) => !c.parent_id);
  const children = all.filter((c) => c.parent_id);
  return parents.map((p) => ({
    ...serializeCategory(p),
    children: children.filter((c) => c.parent_id === p.id).map(serializeCategory),
  }));
}

export function createProductForSupplier(user, data) {
  const supplier = findSupplierByOrganisationId(user.organisation.id);
  if (!supplier) throw new ForbiddenError('Supplier profile not found');

  const category = data.category_id ? findCategoryById(data.category_id) : null;
  if (data.category_id && !category) throw new ValidationError('Invalid category');

  const product = createProduct({ ...data, supplier_id: supplier.id });
  return serializeProduct(product, true, true);
}

export function updateProductForSupplier(user, productId, data) {
  const product = findProductById(productId);
  if (!product) throw new NotFoundError('Product not found');

  const supplier = findSupplierByOrganisationId(user.organisation.id);
  if (product.supplier_id !== supplier?.id && user.role !== 'ADMIN') {
    throw new ForbiddenError('You can only update your own products');
  }

  if (data.category_id) {
    const category = findCategoryById(data.category_id);
    if (!category) throw new ValidationError('Invalid category');
  }

  const updated = updateProduct(productId, data);
  return serializeProduct(updated, true, true);
}

export function removeProduct(user, productId) {
  const product = findProductById(productId);
  if (!product) throw new NotFoundError('Product not found');

  const supplier = findSupplierByOrganisationId(user.organisation.id);
  if (product.supplier_id !== supplier?.id && user.role !== 'ADMIN') {
    throw new ForbiddenError('You can only delete your own products');
  }

  deleteProduct(productId);
}

export function createBatchForProduct(user, productId, data) {
  const product = findProductById(productId);
  if (!product) throw new NotFoundError('Product not found');

  const supplier = findSupplierByOrganisationId(user.organisation.id);
  if (product.supplier_id !== supplier?.id && user.role !== 'ADMIN') {
    throw new ForbiddenError('You can only add batches to your own products');
  }

  const batch = createBatch({ ...data, product_id: productId, supplier_id: supplier?.id || product.supplier_id });
  return serializeBatch(batch, true);
}

export function updateBatchForProduct(user, batchId, data) {
  const batch = findBatchById(batchId);
  if (!batch) throw new NotFoundError('Batch not found');

  const supplier = findSupplierByOrganisationId(user.organisation.id);
  if (batch.supplier_id !== supplier?.id && user.role !== 'ADMIN') {
    throw new ForbiddenError('You can only update your own batches');
  }

  const updated = updateBatch(batchId, data);
  return serializeBatch(updated, true);
}

export function removeBatch(user, batchId) {
  const batch = findBatchById(batchId);
  if (!batch) throw new NotFoundError('Batch not found');

  const supplier = findSupplierByOrganisationId(user.organisation.id);
  if (batch.supplier_id !== supplier?.id && user.role !== 'ADMIN') {
    throw new ForbiddenError('You can only delete your own batches');
  }

  deleteBatch(batchId);
}

export function getBatchesForProduct(productId, isSupplierView = false) {
  const product = findProductById(productId);
  if (!product) throw new NotFoundError('Product not found');
  return findBatchesByProduct(productId).map((b) => serializeBatch(b, isSupplierView));
}

function assertOwnsProduct(user, productId, action) {
  const product = findProductById(productId);
  if (!product) throw new NotFoundError('Product not found');

  const supplier = findSupplierByOrganisationId(user.organisation?.id);
  if (product.supplier_id !== supplier?.id && user.role !== 'ADMIN') {
    throw new ForbiddenError(`You can only ${action} your own products`);
  }
  return product;
}

/**
 * Attach one or more uploaded images to a product. The first image becomes the
 * primary one when the product has none yet, or when isPrimary is requested.
 */
export function addProductImages(user, productId, fileUrls, isPrimary = false) {
  assertOwnsProduct(user, productId, 'add images to');

  const urls = Array.isArray(fileUrls) ? fileUrls : [fileUrls];
  if (urls.length === 0) throw new ValidationError('No image uploaded');

  const hadImages = findProductImages(productId).length > 0;
  let firstImageId = null;

  for (const url of urls) {
    const image = createProductImage({ product_id: productId, file_path: url, is_primary: false });
    if (!firstImageId) firstImageId = image.id;
  }

  // Promote a primary image when requested, or when this is the first upload.
  if (firstImageId && (isPrimary || !hadImages)) {
    setPrimaryImage(productId, firstImageId);
  }

  return serializeProduct(findProductById(productId), true, true);
}

// Backwards-compatible single-image helper.
export function addProductImage(user, productId, fileUrl, isPrimary = false) {
  return addProductImages(user, productId, [fileUrl], isPrimary);
}

export function setProductImagePrimary(user, productId, imageId) {
  assertOwnsProduct(user, productId, 'manage images on');

  const image = findProductImageById(imageId);
  if (!image || image.product_id !== productId) {
    throw new NotFoundError('Image not found');
  }

  setPrimaryImage(productId, imageId);
  return serializeProduct(findProductById(productId), true, true);
}

export function removeProductImage(user, productId, imageId) {
  assertOwnsProduct(user, productId, 'remove images from');

  const image = findProductImageById(imageId);
  if (!image || image.product_id !== productId) {
    throw new NotFoundError('Image not found');
  }

  const wasPrimary = Boolean(image.is_primary);
  deleteProductImage(imageId);

  // If the primary image was removed, promote the next remaining one.
  if (wasPrimary) {
    const remaining = findProductImages(productId);
    if (remaining.length > 0) {
      setPrimaryImage(productId, remaining[0].id);
    }
  }

  return serializeProduct(findProductById(productId), true, true);
}
