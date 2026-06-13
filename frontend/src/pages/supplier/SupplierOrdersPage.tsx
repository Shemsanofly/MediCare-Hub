import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { ordersApi } from '@/api';
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

const SupplierOrdersPage = () => {
  const ordersQuery = useQuery({
    queryKey: ['supplierOrders'],
    queryFn: async () => {
      const { data } = await ordersApi.listOrders();
      return data.results ?? [];
    },
  });

  if (ordersQuery.isLoading) {
    return <LoadingSpinner label="Loading orders…" />;
  }

  if (ordersQuery.isError) {
    return (
      <ErrorMessage
        message={extractErrorMessage(
          ordersQuery.error as AxiosError<ApiErrorResponse>,
        )}
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
                  to={`/supplier/orders/${String(r.id)}`}
                  className="font-medium text-primary hover:underline"
                >
                  {String(r.id).slice(0, 8).toUpperCase()}
                </Link>
              ),
            },
            {
              key: 'hospital_name',
              header: 'Hospital',
              render: (r) => String(r.hospital_name ?? '—'),
            },
            {
              key: 'total_amount',
              header: 'Amount',
              render: (r) =>
                formatTZS(String(r.total_amount), String(r.currency)),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <StatusBadge status={String(r.status)} />,
            },
            {
              key: 'created_at',
              header: 'Date',
              render: (r) => new Date(String(r.created_at)).toLocaleDateString(),
            },
          ]}
        />
      </section>
    </div>
  );
};

export default SupplierOrdersPage;
