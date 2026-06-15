import db from '../config/database.js';
import { findSupplierByOrganisationId } from '../models/supplierModel.js';
import { findOrderById } from '../models/orderModel.js';
import { serializeOrder } from './orderService.js';
import { formatDecimal } from '../utils/helpers.js';
import { findPaymentByOrderIds } from '../models/paymentModel.js';

export function getHospitalDashboard(user, { limit = 5 } = {}) {
  const orgId = user.organisation?.id;
  const orders = db.prepare(`
    SELECT * FROM orders WHERE organisation_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(orgId, limit).map((o) => findOrderById(o.id)).map(serializeOrder);

  const totalOrders = db.prepare('SELECT COUNT(*) as c FROM orders WHERE organisation_id = ?').get(orgId).c;
  const pendingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE organisation_id = ? AND status IN ('PENDING','ACCEPTED','APPROVED','CONFIRMED','PAID','PREPARING','PROCESSING','SHIPPED')").get(orgId).c;
  const deliveredOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE organisation_id = ? AND status = 'DELIVERED'").get(orgId).c;
  const monthlySpending = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total FROM orders
    WHERE organisation_id = ? AND status IN ('PAID','COMPLETED','DELIVERED','PROCESSING','SHIPPED')
    AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
  `).get(orgId).total;

  const cartItems = db.prepare(`SELECT COUNT(*) as c FROM cart_items WHERE user_id = ? AND expires_at > datetime('now')`).get(user.id).c;

  const statusBreakdown = db.prepare(`
    SELECT status, COUNT(*) as count FROM orders WHERE organisation_id = ? GROUP BY status
  `).all(orgId);

  const spendingOverview = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COALESCE(SUM(total_amount), 0) as amount
    FROM orders
    WHERE organisation_id = ? AND status IN ('PAID','COMPLETED')
    GROUP BY month ORDER BY month DESC LIMIT 6
  `).all(orgId);

  const recentProducts = db.prepare(`
    SELECT oi.product_id, p.name as product_name, SUM(oi.quantity_ordered) as quantity, o.id as order_id, o.created_at as ordered_at
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE o.organisation_id = ?
    GROUP BY oi.product_id ORDER BY o.created_at DESC LIMIT 5
  `).all(orgId);

  const topSuppliers = db.prepare(`
    SELECT s.id as supplier_id, o.name as supplier_name, COUNT(o2.id) as order_count, COALESCE(SUM(o2.total_amount), 0) as total_spent
    FROM orders o2
    JOIN suppliers s ON s.id = o2.supplier_id
    JOIN organisations o ON o.id = s.organisation_id
    WHERE o2.organisation_id = ? AND o2.status IN ('PAID','COMPLETED','DELIVERED')
    GROUP BY s.id ORDER BY total_spent DESC LIMIT 5
  `).all(orgId);

  const orderIds = orders.map((o) => o.id);
  const payments = orderIds.length ? findPaymentByOrderIds(orderIds) : [];

  return {
    total_orders: totalOrders,
    pending_orders: pendingOrders,
    delivered_orders: deliveredOrders,
    monthly_spending: formatDecimal(monthlySpending),
    currency: 'TZS',
    cart_items: cartItems,
    recent_orders: orders,
    recent_payments: payments.map((p) => ({
      id: p.id,
      order_id: p.order_id,
      amount: formatDecimal(p.amount),
      currency: p.currency,
      status: p.status,
      gateway: p.gateway,
      initiated_at: p.initiated_at,
    })),
    status_breakdown: statusBreakdown,
    spending_overview: spendingOverview.map((r) => ({ month: r.month, amount: formatDecimal(r.amount) })),
    recent_products_ordered: recentProducts.map((r) => ({
      product_id: r.product_id,
      product_name: r.product_name,
      quantity: r.quantity,
      order_id: r.order_id,
      ordered_at: r.ordered_at,
    })),
    top_suppliers: topSuppliers.map((r) => ({
      supplier_name: r.supplier_name,
      order_count: r.order_count,
      total_spent: formatDecimal(r.total_spent),
    })),
    quick_stats: {
      total_orders: totalOrders,
      pending_orders: pendingOrders,
      monthly_spending: formatDecimal(monthlySpending),
    },
  };
}

export function getSupplierDashboard(user, { limit = 5 } = {}) {
  const supplier = findSupplierByOrganisationId(user.organisation?.id);
  if (!supplier) {
    return {
      supplier_id: null,
      total_products: 0,
      active_products: 0,
      low_stock_products: 0,
      total_orders_received: 0,
      pending_orders: 0,
      total_revenue: '0.00',
      currency: 'TZS',
      my_products: [],
      recent_orders: [],
      inventory_status: [],
      low_stock_alerts: [],
      sales_summary: [],
      product_performance: [],
      quick_stats: {},
    };
  }

  const totalProducts = db.prepare('SELECT COUNT(*) as c FROM products WHERE supplier_id = ?').get(supplier.id).c;
  const activeProducts = db.prepare('SELECT COUNT(*) as c FROM products WHERE supplier_id = ? AND is_active = 1').get(supplier.id).c;

  const products = db.prepare(`
    SELECT p.*, COALESCE(SUM(pb.quantity - pb.reserved_quantity), 0) as stock
    FROM products p
    LEFT JOIN product_batches pb ON pb.product_id = p.id
    WHERE p.supplier_id = ?
    GROUP BY p.id
  `).all(supplier.id);

  const lowStockProducts = products.filter((p) => p.stock > 0 && p.stock < 20).length;

  const totalOrders = db.prepare('SELECT COUNT(*) as c FROM orders WHERE supplier_id = ?').get(supplier.id).c;
  const pendingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE supplier_id = ? AND status IN ('PENDING','ACCEPTED','APPROVED','CONFIRMED','PAID','PREPARING','PROCESSING')").get(supplier.id).c;
  const revenue = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total FROM orders
    WHERE supplier_id = ? AND status IN ('PAID','COMPLETED','DELIVERED')
  `).get(supplier.id).total;

  const orders = db.prepare(`
    SELECT * FROM orders WHERE supplier_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(supplier.id, limit).map((o) => findOrderById(o.id)).map(serializeOrder);

  const salesSummary = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COALESCE(SUM(total_amount), 0) as amount
    FROM orders
    WHERE supplier_id = ? AND status IN ('PAID','COMPLETED')
    GROUP BY month ORDER BY month DESC LIMIT 6
  `).all(supplier.id);

  const productPerformance = db.prepare(`
    SELECT oi.product_id, p.name as product_name, SUM(oi.quantity_ordered) as units_sold, COALESCE(SUM(oi.subtotal), 0) as revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE p.supplier_id = ? AND o.status IN ('PAID','COMPLETED','DELIVERED')
    GROUP BY oi.product_id ORDER BY revenue DESC LIMIT 5
  `).all(supplier.id);

  return {
    supplier_id: supplier.id,
    total_products: totalProducts,
    active_products: activeProducts,
    low_stock_products: lowStockProducts,
    total_orders_received: totalOrders,
    pending_orders: pendingOrders,
    total_revenue: formatDecimal(revenue),
    currency: 'TZS',
    my_products: products.map((p) => ({
      id: p.id,
      name: p.name,
      price: formatDecimal(p.price),
      currency: p.currency,
      is_active: Boolean(p.is_active),
      stock: p.stock,
      unit_of_measure: p.unit_of_measure,
    })),
    recent_orders: orders,
    inventory_status: products.map((p) => ({
      product_id: p.id,
      product_name: p.name,
      stock: p.stock,
      is_active: Boolean(p.is_active),
      price: formatDecimal(p.price),
    })),
    low_stock_alerts: products
      .filter((p) => p.stock > 0 && p.stock < 20)
      .map((p) => ({
        product_id: p.id,
        product_name: p.name,
        stock: p.stock,
        threshold: 20,
      })),
    sales_summary: salesSummary.map((r) => ({ month: r.month, amount: formatDecimal(r.amount) })),
    product_performance: productPerformance.map((r) => ({
      product_id: r.product_id,
      product_name: r.product_name,
      units_sold: r.units_sold,
      revenue: formatDecimal(r.revenue),
    })),
    quick_stats: {
      total_products: totalProducts,
      active_products: activeProducts,
      pending_orders: pendingOrders,
      total_revenue: formatDecimal(revenue),
    },
  };
}

export function getAdminDashboard({ limit = 5 } = {}) {
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalHospitals = db.prepare("SELECT COUNT(*) as c FROM organisations WHERE type = 'HOSPITAL'").get().c;
  const totalSuppliers = db.prepare("SELECT COUNT(*) as c FROM organisations WHERE type = 'SUPPLIER'").get().c;
  const pendingVerifications = db.prepare("SELECT COUNT(*) as c FROM suppliers WHERE verification_status = 'PENDING'").get().c;
  const totalProducts = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  const totalOrders = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  const platformRevenue = db.prepare(`
    SELECT COALESCE(SUM(amount_held * 0.05), 0) as total FROM escrow_accounts WHERE status = 'RELEASED'
  `).get().total;

  const recentUsers = db.prepare(`
    SELECT u.*, o.name as organisation_name FROM users u
    LEFT JOIN organisations o ON o.id = u.organisation_id
    ORDER BY u.created_at DESC LIMIT ?
  `).all(limit).map((u) => ({
    id: u.id,
    email: u.email,
    full_name: `${u.first_name} ${u.last_name}`,
    role: u.role,
    organisation_name: u.organisation_name || '',
    created_at: u.created_at,
  }));

  const recentOrders = db.prepare(`
    SELECT * FROM orders ORDER BY created_at DESC LIMIT ?
  `).all(limit).map((o) => findOrderById(o.id)).map(serializeOrder);

  const verificationRequests = db.prepare(`
    SELECT s.*, o.name as organisation_name FROM suppliers s
    JOIN organisations o ON o.id = s.organisation_id
    WHERE s.verification_status = 'PENDING'
    ORDER BY s.created_at DESC LIMIT ?
  `).all(limit).map((s) => ({
    id: s.id,
    organisation_name: s.organisation_name,
    verification_status: s.verification_status,
    created_at: s.created_at,
  }));

  const productActivity = db.prepare(`
    SELECT p.*, o.name as supplier_name FROM products p
    JOIN suppliers s ON s.id = p.supplier_id
    JOIN organisations o ON o.id = s.organisation_id
    ORDER BY p.updated_at DESC LIMIT ?
  `).all(limit).map((p) => ({
    id: p.id,
    name: p.name,
    supplier_name: p.supplier_name,
    is_active: Boolean(p.is_active),
    updated_at: p.updated_at,
  }));

  const revenueOverview = db.prepare(`
    SELECT strftime('%Y-%m', held_at) as month, COALESCE(SUM(amount_held * 0.05), 0) as amount
    FROM escrow_accounts WHERE status = 'RELEASED'
    GROUP BY month ORDER BY month DESC LIMIT 6
  `).all().map((r) => ({ month: r.month, amount: formatDecimal(r.amount) }));

  const activityLogs = db.prepare(`
    SELECT a.*, u.email as user_email FROM audit_logs a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC LIMIT ?
  `).all(limit).map((a) => ({
    id: a.id,
    action: a.action,
    user_email: a.user_email,
    created_at: a.created_at,
  }));

  return {
    total_users: totalUsers,
    total_hospitals: totalHospitals,
    total_suppliers: totalSuppliers,
    pending_verifications: pendingVerifications,
    total_products: totalProducts,
    total_orders: totalOrders,
    platform_revenue: formatDecimal(platformRevenue),
    currency: 'TZS',
    recent_users: recentUsers,
    recent_orders: recentOrders,
    verification_requests: verificationRequests,
    product_activity: productActivity,
    revenue_overview: revenueOverview,
    activity_logs: activityLogs,
    quick_stats: {
      total_users: totalUsers,
      total_orders: totalOrders,
      pending_verifications: pendingVerifications,
      total_products: totalProducts,
    },
  };
}
