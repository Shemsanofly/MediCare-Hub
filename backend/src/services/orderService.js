import db from '../config/database.js';
import { NotFoundError, ValidationError, ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { getCart, clearCart } from './cartService.js';
import { findProductById, findBatchById, findBatchesByProduct, getTotalAvailableQuantity, reserveBatchStock } from '../models/productModel.js';
import { findSupplierById, findSupplierByOrganisationId } from '../models/supplierModel.js';
import {
  createOrder,
  createOrderItem,
  findOrderById,
  findOrdersByCheckoutGroup,
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
import { notifyBuyerGroupedOrderCreated, notifySupplierOrderCreated, notifyOrderStatus } from './emailService.js';
import { formatDecimal, generateId, nowISO } from '../utils/helpers.js';
import { calculateRevenueSplit, serializeRevenueFields } from './revenueService.js';

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
  const checkoutGroupId = generateId();
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
        checkout_group_id: checkoutGroupId,
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

      const revenue = calculateRevenueSplit(subtotal);
      const total = subtotal + order.delivery_fee + order.tax_amount + revenue.buyer_service_fee;
      db.prepare(`
        UPDATE orders
        SET subtotal = ?,
            platform_fee_rate = ?,
            buyer_service_fee = ?,
            supplier_service_fee = ?,
            platform_revenue = ?,
            supplier_net_amount = ?,
            total_amount = ?
        WHERE id = ?
      `).run(
        subtotal,
        revenue.platform_fee_rate,
        revenue.buyer_service_fee,
        revenue.supplier_service_fee,
        revenue.platform_revenue,
        revenue.supplier_net_amount,
        total,
        order.id,
      );

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
  void notifyBuyerGroupedOrderCreated(orderIds);
  orderIds.forEach((id) => void notifySupplierOrderCreated(id));
  const orders = orderIds.map((id) => serializeOrder(findOrderById(id)));
  const groupedOrder = serializeGroupedOrder(findOrdersByCheckoutGroup(checkoutGroupId));

  return {
    orders,
    order: groupedOrder,
    count: 1,
    supplier_order_count: orders.length,
    payment_instructions:
      orders.length > 1
        ? `${orders.length} supplier fulfilment orders were created under one checkout. Pay once from your orders page.`
        : 'Payment is due immediately. Use the payments API to initiate payment once the supplier accepts the order.',
  };
}

function combineStatuses(orders) {
  const statuses = orders.map((o) => o.status);
  if (statuses.every((s) => s === statuses[0])) return statuses[0];
  if (statuses.includes('DISPUTED')) return 'DISPUTED';
  if (statuses.includes('CANCELLED')) return 'CANCELLED';
  if (statuses.includes('REJECTED')) return 'REJECTED';
  if (statuses.every((s) => s === 'COMPLETED')) return 'COMPLETED';
  if (statuses.every((s) => ['DELIVERED', 'COMPLETED'].includes(s))) return 'DELIVERED';
  if (statuses.every((s) => ['SHIPPED', 'DELIVERED', 'COMPLETED'].includes(s))) return 'SHIPPED';
  if (statuses.some((s) => ['PAID', 'PROCESSING', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED'].includes(s))) return 'PROCESSING';
  if (statuses.some((s) => ['ACCEPTED', 'APPROVED', 'CONFIRMED'].includes(s))) return 'ACCEPTED';
  return 'PENDING';
}

export function serializeGroupedOrder(orders) {
  if (!orders.length) throw new NotFoundError('Order not found');
  if (orders.length === 1) {
    const single = serializeOrder(orders[0]);
    return {
      ...single,
      checkout_group_id: orders[0].checkout_group_id || orders[0].id,
      is_multi_supplier: false,
      supplier_order_count: 1,
      supplier_orders: [single],
    };
  }

  const first = orders[0];
  const supplierOrders = orders.map(serializeOrder);
  const totals = supplierOrders.reduce(
    (sum, order) => ({
      subtotal: sum.subtotal + Number(order.subtotal),
      delivery_fee: sum.delivery_fee + Number(order.delivery_fee),
      tax_amount: sum.tax_amount + Number(order.tax_amount),
      buyer_service_fee: sum.buyer_service_fee + Number(order.buyer_service_fee),
      supplier_service_fee: sum.supplier_service_fee + Number(order.supplier_service_fee),
      platform_revenue: sum.platform_revenue + Number(order.platform_revenue),
      supplier_net_amount: sum.supplier_net_amount + Number(order.supplier_net_amount),
      total_amount: sum.total_amount + Number(order.total_amount),
    }),
    { subtotal: 0, delivery_fee: 0, tax_amount: 0, buyer_service_fee: 0, supplier_service_fee: 0, platform_revenue: 0, supplier_net_amount: 0, total_amount: 0 },
  );
  const payments = orders.map((order) => findPaymentByOrder(order.id)).filter(Boolean);
  const allPaid = payments.length === orders.length && payments.every((payment) => payment.status === 'COMPLETED');
  const items = supplierOrders.flatMap((order) =>
    order.items.map((item) => ({
      ...item,
      supplier_id: order.supplier_id,
      supplier_name: order.supplier_name,
    })),
  );

  return {
    id: first.checkout_group_id,
    checkout_group_id: first.checkout_group_id,
    is_multi_supplier: true,
    supplier_order_count: supplierOrders.length,
    supplier_orders: supplierOrders,
    status: combineStatuses(orders),
    buyer_id: first.buyer_id,
    organisation_id: first.organisation_id,
    supplier_id: 'MULTIPLE',
    supplier_name: `${supplierOrders.length} suppliers`,
    hospital_name: supplierOrders[0]?.hospital_name || 'Unknown',
    subtotal: formatDecimal(totals.subtotal),
    delivery_fee: formatDecimal(totals.delivery_fee),
    tax_amount: formatDecimal(totals.tax_amount),
    platform_fee_rate: formatDecimal((totals.subtotal > 0 ? totals.platform_revenue / totals.subtotal : 0) * 100),
    buyer_service_fee: formatDecimal(totals.buyer_service_fee),
    supplier_service_fee: formatDecimal(totals.supplier_service_fee),
    platform_revenue: formatDecimal(totals.platform_revenue),
    supplier_net_amount: formatDecimal(totals.supplier_net_amount),
    total_amount: formatDecimal(totals.total_amount),
    currency: first.currency,
    lpo_number: first.lpo_number || '',
    payment_terms: first.payment_terms,
    notes: first.notes || '',
    requires_approval: supplierOrders.some((order) => order.requires_approval),
    approval_steps: supplierOrders.flatMap((order) => order.approval_steps),
    items,
    status_history: supplierOrders.flatMap((order) => order.status_history || []),
    payment_status: allPaid ? 'COMPLETED' : payments[0]?.status || null,
    payment_amount: allPaid ? formatDecimal(totals.total_amount) : payments[0] ? formatDecimal(payments[0].amount) : null,
    created_at: first.created_at,
    updated_at: orders.reduce((latest, order) => order.updated_at > latest ? order.updated_at : latest, first.updated_at),
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
    checkout_group_id: order.checkout_group_id || order.id,
    is_multi_supplier: false,
    supplier_order_count: 1,
    supplier_name: supplier?.organisation_name || 'Unknown',
    hospital_name: organisation?.name || 'Unknown',
    subtotal: formatDecimal(order.subtotal),
    delivery_fee: formatDecimal(order.delivery_fee),
    tax_amount: formatDecimal(order.tax_amount),
    ...serializeRevenueFields(order),
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
  if (!order) {
    const groupedOrders = findOrdersByCheckoutGroup(id);
    if (!groupedOrders.length) throw new NotFoundError('Order not found');
    const ownsGroup = groupedOrders.some((groupOrder) => groupOrder.organisation_id === user.organisation?.id || groupOrder.buyer_id === user.id);
    if (user.role !== 'ADMIN' && !ownsGroup) {
      throw new ForbiddenError('You do not have access to this order');
    }
    return serializeGroupedOrder(groupedOrders);
  }

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
    const grouped = new Map();
    for (const order of orders) {
      const groupId = order.checkout_group_id || order.id;
      if (!grouped.has(groupId)) grouped.set(groupId, []);
      grouped.get(groupId).push(order);
    }
    return Array.from(grouped.values()).map(serializeGroupedOrder);
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
