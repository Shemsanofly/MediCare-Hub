import db from '../config/database.js';
import { NotFoundError, ValidationError, ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { getCart, clearCart } from './cartService.js';
import { findProductById, findBatchById, findBatchesByProduct, getTotalAvailableQuantity, reserveBatchStock } from '../models/productModel.js';
import { findSupplierById, findSupplierByOrganisationId } from '../models/supplierModel.js';
import {
  createOrder,
  createOrderItem,
  findOrderById,
  findOrderItems,
  updateOrderStatus,
  addStatusHistory,
  createApprovalStep,
  findApprovalSteps,
  approveNextStep,
  rejectStep,
  listOrdersForBuyerOrganisation,
  listOrdersForSupplier,
  listAllOrders,
  createBatchReservation,
  releaseReservations,
  fulfillReservations,
} from '../models/orderModel.js';
import { findPaymentByOrder } from '../models/paymentModel.js';
import { notifyOrderCreated, notifyOrderStatus } from './emailService.js';
import { formatDecimal, nowISO } from '../utils/helpers.js';

const APPROVAL_THRESHOLDS = [
  { role: 'HOD', amount: 500_000 },
  { role: 'CFO', amount: 2_000_000 },
];

const VALID_TRANSITIONS = {
  PENDING: ['ACCEPTED', 'REJECTED', 'APPROVED', 'CANCELLED', 'DISPUTED'],
  ACCEPTED: ['PREPARING', 'CANCELLED', 'DISPUTED'],
  APPROVED: ['CONFIRMED', 'CANCELLED', 'DISPUTED'],
  CONFIRMED: ['PAID', 'CANCELLED', 'DISPUTED'],
  PAID: ['PROCESSING', 'DISPUTED'],
  PROCESSING: ['SHIPPED', 'DISPUTED'],
  PREPARING: ['SHIPPED', 'DISPUTED'],
  SHIPPED: ['DELIVERED', 'DISPUTED'],
  DELIVERED: ['COMPLETED', 'DISPUTED'],
};

function canTransition(from, to) {
  return VALID_TRANSITIONS[from]?.includes(to) || false;
}

function determineApprovalSteps(totalAmount) {
  return APPROVAL_THRESHOLDS
    .filter((t) => totalAmount > t.amount)
    .map((t, idx) => ({ step_number: idx + 1, required_role: t.role, threshold_amount: t.amount }));
}

export function checkout(user, { notes, payment_terms = 'IMMEDIATE', delivery_fee = 0, tax_amount = 0, lpo_number }) {
  if (!user.organisation) throw new UnauthorizedError('User must belong to an organisation');
  if (user.role !== 'HOSPITAL' && user.role !== 'ADMIN') {
    throw new ForbiddenError('Only hospital users can checkout');
  }

  const cart = getCart(user.id);
  if (!cart.items.length) throw new ValidationError('Cart is empty');

  // Validate stock
  for (const item of cart.items) {
    const product = findProductById(item.product_id);
    const stock = getTotalAvailableQuantity(item.product_id);
    if (stock < item.quantity) {
      throw new ValidationError(`Insufficient stock for ${product.name}`);
    }
  }

  // Group the cart by supplier — a cart may contain items from several
  // suppliers, and each supplier becomes its own order.
  const groups = new Map();
  for (const item of cart.items) {
    if (!groups.has(item.supplier_id)) groups.set(item.supplier_id, []);
    groups.get(item.supplier_id).push(item);
  }

  // Every supplier in the cart must be verified.
  for (const supplierId of groups.keys()) {
    const supplier = findSupplierById(supplierId);
    if (supplier?.verification_status !== 'VERIFIED') {
      throw new ForbiddenError('One or more suppliers in your cart are not verified');
    }
  }

  // Delivery fee / tax are charged once for the whole checkout — applied to the
  // first order only so multiple orders don't multiply them.
  const checkoutDeliveryFee = parseFloat(delivery_fee) || 0;
  const checkoutTaxAmount = parseFloat(tax_amount) || 0;

  // Build one order per supplier inside a single transaction.
  const tx = db.transaction(() => {
    const createdOrderIds = [];
    let isFirstOrder = true;

    for (const [supplierId, items] of groups) {
      const orderDeliveryFee = isFirstOrder ? checkoutDeliveryFee : 0;
      const orderTaxAmount = isFirstOrder ? checkoutTaxAmount : 0;
      isFirstOrder = false;

      const order = createOrder({
        buyer_id: user.id,
        organisation_id: user.organisation.id,
        supplier_id: supplierId,
        status: 'PENDING',
        subtotal: 0,
        delivery_fee: orderDeliveryFee,
        tax_amount: orderTaxAmount,
        total_amount: 0,
        currency: cart.currency,
        lpo_number,
        payment_terms,
        notes,
      });

      let subtotal = 0;

      for (const item of items) {
        const product = findProductById(item.product_id);
        const unitPrice = product.price;
        const lineSubtotal = unitPrice * item.quantity;
        subtotal += lineSubtotal;

        // Allocate batch using FIFO by expiry
        let remaining = item.quantity;
        let allocatedBatchId = item.batch_id || null;

        if (!allocatedBatchId) {
          const batches = findBatchesByProduct(item.product_id).filter(
            (b) => new Date(b.expiry_date) >= new Date() && b.quantity - b.reserved_quantity > 0
          );
          for (const batch of batches) {
            if (remaining <= 0) break;
            const available = batch.quantity - batch.reserved_quantity;
            const toReserve = Math.min(available, remaining);
            reserveBatchStock(batch.id, toReserve);
            createBatchReservation({
              order_id: order.id,
              order_item_id: null,
              batch_id: batch.id,
              quantity: toReserve,
            });
            if (allocatedBatchId === null) allocatedBatchId = batch.id;
            remaining -= toReserve;
          }
        } else {
          reserveBatchStock(allocatedBatchId, item.quantity);
          createBatchReservation({
            order_id: order.id,
            order_item_id: null,
            batch_id: allocatedBatchId,
            quantity: item.quantity,
          });
          remaining = 0;
        }

        if (remaining > 0) {
          throw new ValidationError(`Could not allocate full quantity for ${product.name}`);
        }

        const orderItem = createOrderItem({
          order_id: order.id,
          product_id: item.product_id,
          batch_id: allocatedBatchId,
          quantity_ordered: item.quantity,
          unit_price: unitPrice,
          subtotal: lineSubtotal,
        });

        db.prepare('UPDATE batch_reservations SET order_item_id = ? WHERE order_id = ? AND batch_id = ? AND order_item_id IS NULL').run(
          orderItem.id, order.id, allocatedBatchId
        );
      }

      const total = subtotal + order.delivery_fee + order.tax_amount;
      db.prepare('UPDATE orders SET subtotal = ?, total_amount = ? WHERE id = ?').run(subtotal, total, order.id);

      for (const step of determineApprovalSteps(total)) {
        createApprovalStep({ order_id: order.id, ...step });
      }

      addStatusHistory({ order_id: order.id, from_status: null, to_status: 'PENDING', changed_by_id: user.id });
      createdOrderIds.push(order.id);
    }

    clearCart(user.id);
    return createdOrderIds;
  });

  const orderIds = tx();
  orderIds.forEach((id) => void notifyOrderCreated(id));
  const orders = orderIds.map((id) => serializeOrder(findOrderById(id)));

  return {
    orders,
    order: orders[0], // backwards-compatible: first order
    count: orders.length,
    payment_instructions:
      orders.length > 1
        ? `${orders.length} orders were created — one per supplier. Pay for each from your orders page once accepted.`
        : 'Payment is due immediately. Use the payments API to initiate payment once the supplier accepts the order.',
  };
}

export function serializeOrder(order) {
  const buyer = db.prepare('SELECT * FROM users WHERE id = ?').get(order.buyer_id);
  const supplier = db.prepare(`
    SELECT s.*, o.name as organisation_name
    FROM suppliers s
    JOIN organisations o ON o.id = s.organisation_id
    WHERE s.id = ?
  `).get(order.supplier_id);
  const organisation = db.prepare('SELECT * FROM organisations WHERE id = ?').get(order.organisation_id);
  const items = findOrderItems(order.id).map((item) => {
    const product = findProductById(item.product_id);
    return {
      id: item.id,
      product_id: item.product_id,
      product_name: product?.name || 'Unknown',
      batch_id: item.batch_id,
      quantity_ordered: item.quantity_ordered,
      quantity_delivered: item.quantity_delivered,
      unit_price: formatDecimal(item.unit_price),
      subtotal: formatDecimal(item.subtotal),
    };
  });

  const steps = findApprovalSteps(order.id).map((s) => ({
    id: s.id,
    step_number: s.step_number,
    required_role: s.required_role,
    status: s.status,
    threshold_amount: formatDecimal(s.threshold_amount),
  }));

  const history = db.prepare(`
    SELECT h.*, u.email as changed_by_email, u.role as changed_by_role
    FROM order_status_history h
    LEFT JOIN users u ON u.id = h.changed_by_id
    WHERE h.order_id = ?
    ORDER BY h.created_at
  `).all(order.id).map((h) => ({
    id: h.id,
    from_status: h.from_status,
    to_status: h.to_status,
    changed_by_email: h.changed_by_email,
    changed_by_role: h.changed_by_role,
    reason: h.reason || '',
    created_at: h.created_at,
  }));

  const payment = findPaymentByOrder(order.id);

  return {
    id: order.id,
    status: order.status,
    buyer_id: order.buyer_id,
    organisation_id: order.organisation_id,
    supplier_id: order.supplier_id,
    supplier_name: supplier?.organisation_name || 'Unknown',
    hospital_name: organisation?.name || 'Unknown',
    subtotal: formatDecimal(order.subtotal),
    delivery_fee: formatDecimal(order.delivery_fee),
    tax_amount: formatDecimal(order.tax_amount),
    total_amount: formatDecimal(order.total_amount),
    currency: order.currency,
    lpo_number: order.lpo_number || '',
    payment_terms: order.payment_terms,
    notes: order.notes || '',
    requires_approval: steps.length > 0,
    approval_steps: steps,
    items,
    status_history: history,
    payment_status: payment?.status || null,
    payment_amount: payment ? formatDecimal(payment.amount) : null,
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
}

export function getOrder(id, user) {
  const order = findOrderById(id);
  if (!order) throw new NotFoundError('Order not found');

  if (user.role !== 'ADMIN' &&
      order.buyer_id !== user.id &&
      order.organisation_id !== user.organisation?.id) {
    const supplier = findSupplierByOrganisationId(user.organisation?.id);
    if (supplier?.id !== order.supplier_id) {
      throw new ForbiddenError('You do not have access to this order');
    }
  }

  return serializeOrder(order);
}

export function listMyOrders(user, { status, limit = 50, offset = 0 }) {
  let orders = [];
  if (user.role === 'ADMIN') {
    orders = listAllOrders({ status, limit, offset });
  } else if (user.role === 'SUPPLIER') {
    const supplier = findSupplierByOrganisationId(user.organisation?.id);
    if (supplier) {
      orders = listOrdersForSupplier(supplier.id, { status, limit, offset });
    }
  } else {
    orders = listOrdersForBuyerOrganisation(user.organisation?.id, { status, limit, offset });
  }
  return orders.map(serializeOrder);
}

export function transitionOrder(orderId, user, { status, reason }) {
  const order = findOrderById(orderId);
  if (!order) throw new NotFoundError('Order not found');

  if (!canTransition(order.status, status)) {
    throw new ValidationError(`Cannot transition order from ${order.status} to ${status}`);
  }

  // Authorization checks
  const supplier = findSupplierByOrganisationId(user.organisation?.id);
  const isSupplier = supplier?.id === order.supplier_id;
  const isBuyer = order.organisation_id === user.organisation?.id || order.buyer_id === user.id;

  if (user.role === 'ADMIN') {
    // admin can do anything
  } else if (['ACCEPTED', 'REJECTED', 'CONFIRMED', 'PREPARING', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(status)) {
    if (!isSupplier) throw new ForbiddenError('Only the supplier can perform this action');
  } else if (status === 'COMPLETED') {
    if (!isBuyer) throw new ForbiddenError('Only the buyer can confirm completion');
  } else if (['CANCELLED', 'DISPUTED'].includes(status)) {
    if (!isBuyer && !isSupplier) throw new ForbiddenError('Only buyer or supplier can cancel/dispute');
  } else if (status === 'APPROVED') {
    if (!isBuyer) throw new ForbiddenError('Only buyer can approve');
  }

  const previousStatus = order.status;

  db.transaction(() => {
    updateOrderStatus(orderId, status);
    addStatusHistory({ order_id: orderId, from_status: previousStatus, to_status: status, changed_by_id: user.id, reason });

    if (['REJECTED', 'CANCELLED'].includes(status)) {
      releaseReservations(orderId);
    }
    if (status === 'COMPLETED') {
      fulfillReservations(orderId);
    }
  })();

  void notifyOrderStatus(orderId, status);

  return serializeOrder(findOrderById(orderId));
}

export function approveOrder(orderId, user) {
  const order = findOrderById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.organisation_id !== user.organisation?.id && user.role !== 'ADMIN') {
    throw new ForbiddenError('Only the buying organisation can approve');
  }

  const result = approveNextStep(orderId, user.id);
  if (!result) throw new ValidationError('No pending approval steps');

  if (result.allApproved) {
    updateOrderStatus(orderId, 'APPROVED');
    addStatusHistory({ order_id: orderId, from_status: order.status, to_status: 'APPROVED', changed_by_id: user.id });
  }

  return serializeOrder(findOrderById(orderId));
}

export function rejectOrder(orderId, user, reason) {
  const order = findOrderById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.organisation_id !== user.organisation?.id && user.role !== 'ADMIN') {
    throw new ForbiddenError('Only the buying organisation can reject');
  }

  rejectStep(orderId, user.id, reason);
  updateOrderStatus(orderId, 'REJECTED');
  addStatusHistory({ order_id: orderId, from_status: order.status, to_status: 'REJECTED', changed_by_id: user.id, reason });
  releaseReservations(orderId);

  return serializeOrder(findOrderById(orderId));
}
