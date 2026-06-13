import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { toast } from 'sonner';

import { analyticsApi } from '@/api';
import {
  AlertCardSkeleton,
  KPICardSkeleton,
  Skeleton,
  TableRowSkeleton,
} from '@/components/ui/Skeleton';
import { useAppDispatch } from '@/hooks/useAppStore';
import { addItem } from '@/store/slices/cartSlice';
import { useAuth } from '@/hooks/useAuth';
import type {
  ForecastAlert,
  OrderStatus,
  PendingApprovalOrder,
  RecentOrder,
  StockAlert,
} from '@/types';

const formatTZS = (amount: number) =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency: 'TZS',
    maximumFractionDigits: 0,
  }).format(amount);

const STATUS_STYLES: Record<OrderStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING: 'bg-yellow-100 text-yellow-800',
  PENDING_APPROVAL: 'bg-orange-100 text-orange-800',
  ACCEPTED: 'bg-blue-100 text-blue-800',
  REJECTED: 'bg-red-100 text-red-800',
  PREPARING: 'bg-indigo-100 text-indigo-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  CONFIRMED: 'bg-indigo-100 text-indigo-800',
  PAID: 'bg-purple-100 text-purple-800',
  PROCESSING: 'bg-orange-100 text-orange-800',
  SHIPPED: 'bg-indigo-100 text-indigo-800',
  DELIVERED: 'bg-secondary-100 text-secondary-800',
  COMPLETED: 'bg-secondary-100 text-secondary-800',
  CANCELLED: 'bg-gray-100 text-gray-500',
  DISPUTED: 'bg-red-100 text-red-800',
};

const SEVERITY_STYLES: Record<ForecastAlert['severity'], string> = {
  low: 'border-yellow-200 bg-yellow-50',
  medium: 'border-orange-200 bg-orange-50',
  high: 'border-red-200 bg-red-50',
};

const hasApprovalRole = (role?: string | null) =>
  role === 'HOSPITAL' || role === 'ADMIN';

/** Hospital procurement dashboard with KPIs, alerts, and order management. */
const Dashboard = () => {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [approvalModal, setApprovalModal] = useState<PendingApprovalOrder | null>(null);

  const kpisQuery = useQuery({
    queryKey: ['hospitalKPIs'],
    queryFn: async () => {
      const { data } = await analyticsApi.getHospitalKPIs();
      return data;
    },
  });

  const stockAlertsQuery = useQuery({
    queryKey: ['stockAlerts'],
    queryFn: async () => {
      const { data } = await analyticsApi.getStockAlerts();
      return data.results ?? [];
    },
  });

  const forecastQuery = useQuery({
    queryKey: ['forecastAlerts'],
    queryFn: async () => {
      const { data } = await analyticsApi.getForecastAlerts();
      return data.results ?? [];
    },
  });

  const pendingQuery = useQuery({
    queryKey: ['pendingApprovals'],
    queryFn: async () => {
      const { data } = await analyticsApi.getPendingApprovals();
      return data.results ?? [];
    },
  });

  const recentOrdersQuery = useQuery({
    queryKey: ['recentOrders'],
    queryFn: async () => {
      const { data } = await analyticsApi.getRecentOrders();
      return data.results ?? [];
    },
  });

  const approveMutation = useMutation({
    mutationFn: (orderId: string) => analyticsApi.approveOrder(orderId),
    onSuccess: () => {
      toast.success('Order approved.');
      setApprovalModal(null);
      void queryClient.invalidateQueries({ queryKey: ['pendingApprovals'] });
      void queryClient.invalidateQueries({ queryKey: ['recentOrders'] });
      void queryClient.invalidateQueries({ queryKey: ['hospitalKPIs'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (orderId: string) => analyticsApi.rejectOrder(orderId),
    onSuccess: () => {
      toast.success('Order rejected.');
      void queryClient.invalidateQueries({ queryKey: ['pendingApprovals'] });
      void queryClient.invalidateQueries({ queryKey: ['recentOrders'] });
    },
  });

  const handleOrderNow = (alert: StockAlert) => {
    dispatch(
      addItem({
        productId: alert.product_id,
        name: alert.product_name,
        quantity: alert.recommended_order_quantity,
        unitPrice: alert.unit_price,
        currency: alert.currency,
      }),
    );
    toast.success(`${alert.product_name} added to cart.`);
  };

  const stockAlerts = stockAlertsQuery.data ?? [];
  const forecastAlerts = forecastQuery.data ?? [];
  const pendingApprovals = pendingQuery.data ?? [];
  const recentOrders = recentOrdersQuery.data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-primary">Hospital Dashboard</h1>
        <p className="mt-1 text-gray-600">
          Monitor spend, stock levels, and procurement activity.
        </p>
      </div>

      {/* KPI Cards */}
      <section>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpisQuery.isLoading ? (
            <>
              <KPICardSkeleton />
              <KPICardSkeleton />
              <KPICardSkeleton />
              <KPICardSkeleton />
            </>
          ) : (
            <>
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Monthly spend</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {formatTZS(kpisQuery.data?.monthly_spend.amount ?? 0)}
                </p>
                <p
                  className={`mt-1 text-sm ${
                    (kpisQuery.data?.monthly_spend.trend_percent ?? 0) >= 0
                      ? 'text-red-600'
                      : 'text-secondary'
                  }`}
                >
                  {(kpisQuery.data?.monthly_spend.trend_percent ?? 0) >= 0 ? '↑' : '↓'}{' '}
                  {Math.abs(kpisQuery.data?.monthly_spend.trend_percent ?? 0)}% vs last month
                </p>
              </div>

              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Active orders</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {kpisQuery.data?.active_orders.count ?? 0}
                </p>
                {(kpisQuery.data?.active_orders.pending_approval ?? 0) > 0 && (
                  <span className="mt-2 inline-block rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800">
                    {kpisQuery.data?.active_orders.pending_approval} pending approval
                  </span>
                )}
              </div>

              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Stock alerts</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-2xl font-bold text-gray-900">
                    {kpisQuery.data?.stock_alerts.count ?? stockAlerts.length}
                  </p>
                  {(kpisQuery.data?.stock_alerts.count ?? stockAlerts.length) > 0 && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                      Action needed
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Avg. supplier rating</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  ★ {kpisQuery.data?.avg_supplier_rating.rating?.toFixed(1) ?? '—'}
                  <span className="text-base font-normal text-gray-400">
                    /{kpisQuery.data?.avg_supplier_rating.max ?? 5}
                  </span>
                </p>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Stock Alerts */}
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Stock Alerts</h2>
          {stockAlertsQuery.isLoading ? (
            <div className="space-y-3">
              <AlertCardSkeleton />
              <AlertCardSkeleton />
            </div>
          ) : stockAlerts.length === 0 ? (
            <p className="text-sm text-gray-500">All products are above reorder point.</p>
          ) : (
            <ul className="space-y-3">
              {stockAlerts.map((alert) => (
                <li
                  key={alert.id}
                  className="flex flex-col gap-3 rounded-lg border border-red-100 bg-red-50/50 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-900">{alert.product_name}</p>
                    <p className="text-sm text-gray-600">
                      Current: {alert.current_stock} units ·{' '}
                      {alert.days_remaining} days remaining
                    </p>
                    <p className="text-sm text-gray-600">
                      Recommended order: {alert.recommended_order_quantity} units
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOrderNow(alert)}
                    className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
                  >
                    Order Now
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* AI Forecast Alerts */}
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">AI Forecast Alerts</h2>
          {forecastQuery.isLoading ? (
            <div className="space-y-3">
              <AlertCardSkeleton />
              <AlertCardSkeleton />
            </div>
          ) : forecastAlerts.length === 0 ? (
            <p className="text-sm text-gray-500">No forecast alerts in the next 30 days.</p>
          ) : (
            <div className="space-y-3">
              {forecastAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`rounded-lg border p-4 ${SEVERITY_STYLES[alert.severity]}`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium uppercase">
                      {alert.alert_type === 'seasonal' ? 'Seasonal' : 'Stockout risk'}
                    </span>
                    {alert.days_until_stockout !== undefined && (
                      <span className="text-xs text-gray-600">
                        within {alert.days_until_stockout} days
                      </span>
                    )}
                  </div>
                  {alert.product_name && (
                    <p className="font-medium text-gray-900">{alert.product_name}</p>
                  )}
                  <p className="text-sm text-gray-700">{alert.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Pending Approvals */}
      {hasApprovalRole(user?.role) && (
        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Pending Approvals</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Order #</th>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Requested by</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingQuery.isLoading ? (
                  <>
                    <TableRowSkeleton columns={5} />
                    <TableRowSkeleton columns={5} />
                  </>
                ) : pendingApprovals.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                      No orders awaiting approval.
                    </td>
                  </tr>
                ) : (
                  pendingApprovals.map((order) => (
                    <tr key={order.id} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-medium">{order.order_number}</td>
                      <td className="px-4 py-3">{order.supplier_name}</td>
                      <td className="px-4 py-3">
                        {formatTZS(order.amount)} {order.currency}
                      </td>
                      <td className="px-4 py-3">{order.requested_by}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setApprovalModal(order)}
                            className="rounded-md bg-secondary px-3 py-1 text-xs font-semibold text-white hover:bg-secondary-600"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectMutation.mutate(order.id)}
                            disabled={rejectMutation.isPending}
                            className="rounded-md border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent Orders */}
      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Orders</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Order #</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentOrdersQuery.isLoading ? (
                <>
                  <TableRowSkeleton columns={5} />
                  <TableRowSkeleton columns={5} />
                  <TableRowSkeleton columns={5} />
                </>
              ) : recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                    No recent orders.
                  </td>
                </tr>
              ) : (
                recentOrders.slice(0, 10).map((order) => (
                  <Fragment key={order.id}>
                    <tr
                      className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                      onClick={() =>
                        setExpandedOrderId(expandedOrderId === order.id ? null : order.id)
                      }
                    >
                      <td className="px-4 py-3 font-medium">{order.order_number}</td>
                      <td className="px-4 py-3">{order.supplier_name}</td>
                      <td className="px-4 py-3">{formatTZS(order.amount)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            STATUS_STYLES[order.status] ?? STATUS_STYLES.PENDING
                          }`}
                        >
                          {order.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                    {expandedOrderId === order.id && (
                      <tr className="bg-gray-50">
                        <td colSpan={5} className="px-4 py-4">
                          <OrderDetailsInline order={order} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Approval confirmation modal */}
      {approvalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Confirm approval</h3>
            <p className="mt-1 text-sm text-gray-500">
              Review order details before approving.
            </p>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Order #</dt>
                <dd className="font-medium">{approvalModal.order_number}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Supplier</dt>
                <dd className="font-medium">{approvalModal.supplier_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Requested by</dt>
                <dd className="font-medium">{approvalModal.requested_by}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Total</dt>
                <dd className="font-medium">
                  {formatTZS(approvalModal.amount)} {approvalModal.currency}
                </dd>
              </div>
            </dl>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-gray-700">Line items</p>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                {approvalModal.items.map((item) => (
                  <li key={item.id} className="flex justify-between px-3 py-2 text-sm">
                    <span>
                      {item.product_name} × {item.quantity}
                    </span>
                    <span>{formatTZS(item.total_price)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setApprovalModal(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2 font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => approveMutation.mutate(approvalModal.id)}
                disabled={approveMutation.isPending}
                className="flex-1 rounded-lg bg-secondary py-2 font-semibold text-white hover:bg-secondary-600 disabled:opacity-60"
              >
                {approveMutation.isPending ? 'Approving…' : 'Confirm approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const OrderDetailsInline = ({ order }: { order: RecentOrder }) => (
  <div>
    <p className="mb-2 text-sm font-medium text-gray-700">Order items</p>
    {order.items?.length ? (
      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between px-3 py-2 text-sm">
            <span>
              {item.product_name} × {item.quantity}
            </span>
            <span>{formatTZS(item.total_price)}</span>
          </li>
        ))}
      </ul>
    ) : (
      <Skeleton className="h-16 w-full" />
    )}
  </div>
);

export default Dashboard;
