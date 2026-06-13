import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ordersApi } from '@/api';
import { extractErrorMessage } from '@/api/axiosConfig';
import ConfirmActionModal from '@/components/admin/ConfirmActionModal';
import StatusBadge from '@/components/dashboard/StatusBadge';
import OrderTimeline from '@/components/orders/OrderTimeline';
import StatusProgressTracker from '@/components/orders/StatusProgressTracker';
import { Skeleton } from '@/components/ui/Skeleton';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';
import { useState } from 'react';

const formatTZS = (amount: string | number, currency = 'TZS') =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));

/** Order detail page backed by the orders API. */
const OrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const queryClient = useQueryClient();
  const [confirmComplete, setConfirmComplete] = useState(false);

  const orderQuery = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const { data } = await ordersApi.getOrder(orderId!);
      return data;
    },
    enabled: Boolean(orderId),
  });

  const completeMutation = useMutation({
    mutationFn: () => ordersApi.completeOrder(orderId!),
    onSuccess: () => {
      toast.success('Delivery confirmed. Order completed.');
      setConfirmComplete(false);
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['hospitalDashboard'] });
    },
    onError: (error: AxiosError<ApiErrorResponse>) => {
      toast.error(extractErrorMessage(error));
    },
  });

  const order = orderQuery.data;

  if (orderQuery.isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  if (!order) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-12 text-center">
        <p className="text-gray-500">Order not found.</p>
        <Link to="/hospital/dashboard" className="mt-4 inline-block text-primary hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/hospital/dashboard" className="text-sm text-primary hover:underline">
          ← Back to dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Order details</h1>
          <StatusBadge status={order.status} />
        </div>
        <p className="text-sm text-gray-500">
          {order.id.slice(0, 8).toUpperCase()} · {order.supplier_name}
        </p>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Order progress</h2>
        <StatusProgressTracker status={order.status} />
      </section>

      {order.status === 'DELIVERED' && (
        <section className="rounded-xl border border-secondary-100 bg-secondary-50 p-5">
          <h2 className="font-semibold text-gray-900">Confirm delivery</h2>
          <p className="mt-1 text-sm text-gray-600">
            The supplier marked this order as delivered. Confirm receipt to complete the order.
          </p>
          <button
            type="button"
            onClick={() => setConfirmComplete(true)}
            className="mt-4 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white hover:bg-secondary-600"
          >
            Confirm Delivery
          </button>
        </section>
      )}

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Supplier</dt>
            <dd className="font-medium">{order.supplier_name}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Payment terms</dt>
            <dd className="font-medium">{order.payment_terms}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Total</dt>
            <dd className="font-medium">
              {formatTZS(order.total_amount, order.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Created</dt>
            <dd className="font-medium">
              {new Date(order.created_at).toLocaleString()}
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Line items</h2>
          <ul className="divide-y divide-gray-100">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between py-2 text-sm">
                <span>
                  {item.product_name} × {item.quantity_ordered}
                </span>
                <span>{formatTZS(item.subtotal, order.currency)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Status history</h2>
          <OrderTimeline
            history={order.status_history ?? []}
            orderCreatedAt={order.created_at}
            currentStatus={order.status}
          />
        </section>
      </div>

      <ConfirmActionModal
        open={confirmComplete}
        title="Confirm delivery"
        message="Confirm that you have received this order in good condition?"
        confirmLabel="Confirm delivery"
        confirmTone="primary"
        isLoading={completeMutation.isPending}
        onCancel={() => setConfirmComplete(false)}
        onConfirm={() => completeMutation.mutate()}
      />
    </div>
  );
};

export default OrderDetail;
