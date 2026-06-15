import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { ordersApi } from '@/api';
import { extractErrorMessage } from '@/api/axiosConfig';
import EmptyState from '@/components/dashboard/EmptyState';
import ErrorMessage from '@/components/dashboard/ErrorMessage';
import LoadingSpinner from '@/components/dashboard/LoadingSpinner';
import StatusBadge from '@/components/dashboard/StatusBadge';
import StatusProgressTracker from '@/components/orders/StatusProgressTracker';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';

const formatTZS = (amount: string | number, currency = 'TZS') =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/** Buyer-facing list of placed orders, each with at-a-glance delivery tracking. */
const Orders = () => {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('ALL');

  const ordersQuery = useQuery({
    queryKey: ['hospitalOrders'],
    queryFn: async () => {
      const { data } = await ordersApi.listOrders();
      return data.results ?? [];
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (orderId: string) => ordersApi.completeOrder(orderId),
    onSuccess: () => {
      toast.success('Delivery confirmed — order completed.');
      void queryClient.invalidateQueries({ queryKey: ['hospitalOrders'] });
      void queryClient.invalidateQueries({ queryKey: ['hospitalDashboard'] });
    },
    onError: (error: AxiosError<ApiErrorResponse>) => {
      toast.error(extractErrorMessage(error));
    },
  });

  const orders = ordersQuery.data ?? [];

  // Status options present in the buyer's own order history.
  const statusOptions = useMemo(() => {
    const set = new Set(orders.map((o) => o.status));
    return ['ALL', ...Array.from(set)];
  }, [orders]);

  const visibleOrders = useMemo(
    () => (statusFilter === 'ALL' ? orders : orders.filter((o) => o.status === statusFilter)),
    [orders, statusFilter],
  );

  if (ordersQuery.isLoading) {
    return <LoadingSpinner label="Loading your orders…" />;
  }

  if (ordersQuery.isError) {
    return (
      <ErrorMessage
        message={extractErrorMessage(ordersQuery.error as AxiosError<ApiErrorResponse>)}
        onRetry={() => void ordersQuery.refetch()}
      />
    );
  }

  if (orders.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Orders</h1>
          <p className="text-sm text-gray-500">Track the products you have ordered.</p>
        </div>
        <EmptyState
          title="No orders yet"
          description="Once you place an order from the marketplace, you can track its progress here."
          action={
            <Link
              to="/marketplace"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
            >
              Browse marketplace
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Orders</h1>
          <p className="text-sm text-gray-500">
            {orders.length} order{orders.length === 1 ? '' : 's'} · track the products you have
            ordered
          </p>
        </div>
        <label className="text-sm text-gray-600">
          <span className="mr-2">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status === 'ALL' ? 'All statuses' : status.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visibleOrders.length === 0 ? (
        <EmptyState title="No orders match this filter" description="Try a different status." />
      ) : (
        <div className="space-y-4">
          {visibleOrders.map((order) => {
            const itemCount = order.items.reduce((sum, i) => sum + i.quantity_ordered, 0);
            return (
              <section
                key={order.id}
                className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/hospital/orders/${order.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        Order #{order.id.slice(0, 8).toUpperCase()}
                      </Link>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {formatDate(order.created_at)} · {order.supplier_name} · {itemCount} item
                      {itemCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">
                      {formatTZS(order.total_amount, order.currency)}
                    </p>
                    <Link
                      to={`/hospital/orders/${order.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Track order →
                    </Link>
                  </div>
                </div>

                <ul className="mt-4 divide-y divide-gray-100 border-y border-gray-100">
                  {order.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between py-2 text-sm text-gray-700"
                    >
                      <span>
                        {item.product_name}
                        <span className="text-gray-400"> × {item.quantity_ordered}</span>
                      </span>
                      <span className="text-gray-500">
                        {formatTZS(item.subtotal, order.currency)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4">
                  <StatusProgressTracker status={order.status} />
                </div>

                {order.status === 'DELIVERED' && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-secondary-100 bg-secondary-50 p-3">
                    <p className="text-sm text-gray-700">
                      Marked delivered by {order.supplier_name}. Confirm receipt to complete the
                      order.
                    </p>
                    <button
                      type="button"
                      disabled={confirmMutation.isPending}
                      onClick={() => confirmMutation.mutate(order.id)}
                      className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white hover:bg-secondary-600 disabled:opacity-60"
                    >
                      {confirmMutation.isPending ? 'Confirming…' : 'Confirm delivery'}
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Orders;
