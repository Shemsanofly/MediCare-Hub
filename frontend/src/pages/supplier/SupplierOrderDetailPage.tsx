import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ordersApi } from '@/api';
import { extractErrorMessage } from '@/api/axiosConfig';
import ConfirmActionModal from '@/components/admin/ConfirmActionModal';
import ErrorMessage from '@/components/dashboard/ErrorMessage';
import LoadingSpinner from '@/components/dashboard/LoadingSpinner';
import StatusBadge from '@/components/dashboard/StatusBadge';
import OrderTimeline from '@/components/orders/OrderTimeline';
import StatusProgressTracker from '@/components/orders/StatusProgressTracker';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';

const formatTZS = (amount: string | number, currency = 'TZS') =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));

const SupplierOrderDetailPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const queryClient = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [pendingAction, setPendingAction] = useState<
    'accept' | 'prepare' | 'ship' | 'deliver' | null
  >(null);

  const orderQuery = useQuery({
    queryKey: ['supplierOrder', orderId],
    queryFn: async () => {
      const { data } = await ordersApi.getOrder(orderId!);
      return data;
    },
    enabled: Boolean(orderId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['supplierOrder', orderId] });
    void queryClient.invalidateQueries({ queryKey: ['supplierOrders'] });
    void queryClient.invalidateQueries({ queryKey: ['supplierDashboard'] });
  };

  const actionMutation = useMutation({
    mutationFn: async (action: 'accept' | 'prepare' | 'ship' | 'deliver' | 'reject') => {
      if (!orderId) throw new Error('Missing order ID');
      switch (action) {
        case 'accept':
          return ordersApi.acceptOrder(orderId);
        case 'prepare':
          return ordersApi.prepareOrder(orderId);
        case 'ship':
          return ordersApi.shipOrder(orderId);
        case 'deliver':
          return ordersApi.deliverOrder(orderId);
        case 'reject':
          return ordersApi.rejectOrder(orderId, rejectReason.trim());
        default:
          throw new Error('Unknown action');
      }
    },
    onSuccess: () => {
      toast.success('Order updated.');
      setPendingAction(null);
      setRejectOpen(false);
      setRejectReason('');
      invalidate();
    },
    onError: (error: AxiosError<ApiErrorResponse>) => {
      toast.error(extractErrorMessage(error));
    },
  });

  if (orderQuery.isLoading) {
    return <LoadingSpinner label="Loading order…" />;
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <ErrorMessage
        message={
          orderQuery.isError
            ? extractErrorMessage(orderQuery.error as AxiosError<ApiErrorResponse>)
            : 'Order not found.'
        }
        onRetry={() => void orderQuery.refetch()}
      />
    );
  }

  const order = orderQuery.data;
  const status = order.status;

  const actionButton = (
    label: string,
    action: 'accept' | 'prepare' | 'ship' | 'deliver',
    tone: 'primary' | 'secondary' = 'primary',
  ) => (
    <button
      type="button"
      onClick={() => setPendingAction(action)}
      className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
        tone === 'secondary'
          ? 'bg-secondary hover:bg-secondary-600'
          : 'bg-primary hover:bg-primary-600'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link to="/supplier/orders" className="text-sm text-primary hover:underline">
          ← Back to orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">
            Order {order.id.slice(0, 8).toUpperCase()}
          </h1>
          <StatusBadge status={status} />
        </div>
        <p className="text-sm text-gray-500">
          {order.hospital_name ?? 'Hospital'} ·{' '}
          {formatTZS(order.total_amount, order.currency)}
        </p>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Fulfillment progress</h2>
        <StatusProgressTracker status={status} />
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Order actions</h2>
        <div className="flex flex-wrap gap-3">
          {status === 'PENDING' && (
            <>
              {actionButton('Accept Order', 'accept', 'secondary')}
              <button
                type="button"
                onClick={() => setRejectOpen(true)}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Reject Order
              </button>
            </>
          )}
          {status === 'ACCEPTED' && actionButton('Prepare Shipment', 'prepare')}
          {status === 'PREPARING' && actionButton('Mark Shipped', 'ship')}
          {status === 'SHIPPED' && actionButton('Mark Delivered', 'deliver', 'secondary')}
          {!['PENDING', 'ACCEPTED', 'PREPARING', 'SHIPPED'].includes(status) && (
            <p className="text-sm text-gray-500">No supplier actions available for this status.</p>
          )}
        </div>
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
            currentStatus={status}
          />
        </section>
      </div>

      <ConfirmActionModal
        open={pendingAction !== null}
        title="Confirm order action"
        message={`Proceed with ${pendingAction?.replace(/^\w/, (c) => c.toUpperCase())} for this order?`}
        confirmLabel="Confirm"
        isLoading={actionMutation.isPending}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (!pendingAction) return;
          actionMutation.mutate(pendingAction);
        }}
      />

      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Reject order</h3>
            <p className="mt-2 text-sm text-gray-600">
              Provide a reason for rejecting this order (minimum 10 characters).
            </p>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={4}
              className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setRejectOpen(false);
                  setRejectReason('');
                }}
                className="flex-1 rounded-lg border border-gray-300 py-2 font-semibold text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectReason.trim().length < 10 || actionMutation.isPending}
                onClick={() => actionMutation.mutate('reject')}
                className="flex-1 rounded-lg bg-red-600 py-2 font-semibold text-white disabled:opacity-60"
              >
                {actionMutation.isPending ? 'Processing…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierOrderDetailPage;
