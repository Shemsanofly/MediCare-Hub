import { ordersApi, type BackendOrder } from './ordersApi';
import type {
  ForecastAlert,
  HospitalKPIs,
  PendingApprovalOrder,
  RecentOrder,
  StockAlert,
} from '@/types';

const toRecentOrder = (order: BackendOrder): RecentOrder => ({
  id: order.id,
  order_number: order.id.slice(0, 8).toUpperCase(),
  supplier_name: order.supplier_name,
  amount: Number(order.total_amount),
  currency: order.currency,
  status: order.status,
  created_at: order.created_at,
  items: order.items.map((item) => ({
    id: item.id,
    product_name: item.product_name,
    quantity: item.quantity_ordered,
    unit_price: Number(item.unit_price),
    total_price: Number(item.subtotal),
  })),
});

const toPendingApproval = (order: BackendOrder): PendingApprovalOrder => ({
  ...toRecentOrder(order),
  requested_by: order.buyer_id,
});

const buildKpisFromOrders = (orders: BackendOrder[]): HospitalKPIs => {
  const active = orders.filter(
    (order) => !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(order.status),
  );
  const pendingApproval = orders.filter(
    (order) => order.status === 'PENDING_APPROVAL' || order.requires_approval,
  );
  const monthlySpend = orders.reduce(
    (sum, order) => sum + Number(order.total_amount),
    0,
  );

  return {
    monthly_spend: {
      amount: monthlySpend,
      currency: orders[0]?.currency ?? 'TZS',
      trend_percent: 0,
    },
    active_orders: {
      count: active.length,
      pending_approval: pendingApproval.length,
    },
    stock_alerts: { count: 0 },
    avg_supplier_rating: { rating: 0, max: 5 },
  };
};

/** Hospital dashboard data mapped to existing backend order endpoints. */
export const analyticsApi = {
  getHospitalKPIs: async () => {
    const { data } = await ordersApi.listOrders();
    return { data: buildKpisFromOrders(data.results ?? []) };
  },

  getStockAlerts: async () => ({
    data: { results: [] as StockAlert[] },
  }),

  getForecastAlerts: async () => ({
    data: { results: [] as ForecastAlert[] },
  }),

  getPendingApprovals: async () => {
    const { data } = await ordersApi.listOrders();
    const pending = (data.results ?? []).filter(
      (order) => order.requires_approval && order.status === 'PENDING',
    );
    return { data: { results: pending.map(toPendingApproval) } };
  },

  getRecentOrders: async () => {
    const { data } = await ordersApi.listOrders();
    return { data: { results: (data.results ?? []).map(toRecentOrder) } };
  },

  approveOrder: async (orderId: string) => {
    const { data } = await ordersApi.approveOrder(orderId);
    return { data: toRecentOrder(data) };
  },

  rejectOrder: async (orderId: string, reason?: string) => {
    const { data } = await ordersApi.transitionOrder(
      orderId,
      'CANCELLED',
      reason,
    );
    return { data: toRecentOrder(data) };
  },
};
