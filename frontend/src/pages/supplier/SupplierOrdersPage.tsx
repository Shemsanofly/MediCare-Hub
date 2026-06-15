import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { ordersApi } from '@/api';
import type { BackendOrder } from '@/api/ordersApi';
import DataTable from '@/components/dashboard/DataTable';
import EmptyState from '@/components/dashboard/EmptyState';
import ErrorMessage from '@/components/dashboard/ErrorMessage';
import LoadingSpinner from '@/components/dashboard/LoadingSpinner';
import StatusBadge from '@/components/dashboard/StatusBadge';
import { extractErrorMessage } from '@/api/axiosConfig';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';

const formatTZS = (amount: string | number, currency = 'TZS') =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));

type SupplierAction = 'accept' | 'prepare' | 'ship' | 'deliver' | 'reject';

/** The next fulfilment action the supplier can take, per order status. */
const NEXT_ACTION: Record<string, { action: SupplierAction; label: string } | null> = {
  PENDING: { action: 'accept', label: 'Accept' },
  ACCEPTED: { action: 'prepare', label: 'Prepare shipment' },
  PREPARING: { action: 'ship', label: 'Mark shipped' },
  SHIPPED: { action: 'deliver', label: 'Mark delivered' },
};

const SupplierOrdersPage = () => {
  const queryClient = useQueryClient();
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const ordersQuery = useQuery({
    queryKey: ['supplierOrders'],
    queryFn: async () => {
      const { data } = await ordersApi.listOrders();
      return data.results ?? [];
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      orderId,
      action,
      reason,
    }: {
      orderId: string;
      action: SupplierAction;
      reason?: string;
    }) => {
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
          return ordersApi.rejectOrder(orderId, reason ?? '');
      }
    },
    onSuccess: () => {
      toast.success('Order updated.');
      setRejectFor(null);
      setRejectReason('');
      void queryClient.invalidateQueries({ queryKey: ['supplierOrders'] });
      void queryClient.invalidateQueries({ queryKey: ['supplierDashboard'] });
    },
    onError: (error: AxiosError<ApiErrorResponse>) => {
      toast.error(extractErrorMessage(error));
    },
  });

  if (ordersQuery.isLoading) {
    return <LoadingSpinner label="Loading orders…" />;
  }

  if (ordersQuery.isError) {
    return (
      <ErrorMessage
        message={extractErrorMessage(ordersQuery.error as AxiosError<ApiErrorResponse>)}
        onRetry={() => void ordersQuery.refetch()}
      />
    );
  }

  const orders = ordersQuery.data ?? [];

  if (orders.length === 0) {
    return (
      <EmptyState
        title="No orders received"
        description="Orders from hospitals will appear here once they place purchases."
      />
    );
  }

  const renderActions = (order: BackendOrder) => {
    const next = NEXT_ACTION[order.status];
    const busy = actionMutation.isPending;

    if (order.status === 'PENDING') {
      return (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => actionMutation.mutate({ orderId: order.id, action: 'accept' })}
            className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-white hover:bg-secondary-600 disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setRejectReason('');
              setRejectFor(order.id);
            }}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      );
    }

    if (next) {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => actionMutation.mutate({ orderId: order.id, action: next.action })}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
        >
          {next.label}
        </button>
      );
    }

    if (order.status === 'DELIVERED') {
      return <span className="text-xs text-gray-400">Awaiting buyer confirmation</span>;
    }

    return <span className="text-xs text-gray-400">—</span>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Incoming Orders</h1>
        <p className="text-sm text-gray-500">{orders.length} orders</p>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <DataTable
          rows={orders}
          columns={[
            {
              key: 'id',
              header: 'Order #',
              render: (r) => (
                <Link
                  to={`/supplier/orders/${r.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {r.id.slice(0, 8).toUpperCase()}
                </Link>
              ),
            },
            {
              key: 'hospital_name',
              header: 'Hospital',
              render: (r) => r.hospital_name ?? '—',
            },
            {
              key: 'total_amount',
              header: 'Amount',
              render: (r) => formatTZS(r.total_amount, r.currency),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <StatusBadge status={r.status} />,
            },
            {
              key: 'created_at',
              header: 'Date',
              render: (r) => new Date(r.created_at).toLocaleDateString(),
            },
            {
              key: 'actions',
              header: 'Action',
              render: renderActions,
            },
          ]}
        />
      </section>

      {rejectFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Reject order</h3>
            <p className="mt-1 text-sm text-gray-600">
              Let the buyer know why you can&apos;t fulfil this order.
            </p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (min. 10 characters)…"
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setRejectFor(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectReason.trim().length < 10 || actionMutation.isPending}
                onClick={() =>
                  actionMutation.mutate({
                    orderId: rejectFor,
                    action: 'reject',
                    reason: rejectReason.trim(),
                  })
                }
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {actionMutation.isPending ? 'Rejecting…' : 'Reject order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierOrdersPage;
