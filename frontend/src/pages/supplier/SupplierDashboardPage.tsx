import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { dashboardApi } from '@/api';
import { extractErrorMessage } from '@/api/axiosConfig';
import DataTable from '@/components/dashboard/DataTable';
import ErrorMessage from '@/components/dashboard/ErrorMessage';
import LoadingSpinner from '@/components/dashboard/LoadingSpinner';
import QuickActionCard from '@/components/dashboard/QuickActionCard';
import StatCard from '@/components/dashboard/StatCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';

const formatTZS = (amount: string | number, currency = 'TZS') =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));

const SupplierDashboardPage = () => {
  const summaryQuery = useQuery({
    queryKey: ['supplierDashboard'],
    queryFn: async () => {
      const { data } = await dashboardApi.getSupplierSummary();
      return data;
    },
  });

  if (summaryQuery.isLoading) {
    return <LoadingSpinner />;
  }

  if (summaryQuery.isError) {
    return (
      <ErrorMessage
        message={extractErrorMessage(
          summaryQuery.error as AxiosError<ApiErrorResponse>,
        )}
        onRetry={() => void summaryQuery.refetch()}
      />
    );
  }

  const data = summaryQuery.data!;

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Total Products" value={data.total_products} accent="secondary" />
        <StatCard title="Active Products" value={data.active_products} accent="primary" />
        <StatCard title="Low Stock Products" value={data.low_stock_products} accent="accent" />
        <StatCard title="Orders Received" value={data.total_orders_received} accent="primary" />
        <StatCard title="Pending Orders" value={data.pending_orders} accent="accent" />
        <StatCard
          title="Total Revenue"
          value={formatTZS(data.total_revenue, data.currency)}
          accent="secondary"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickActionCard title="Add Product" description="List a new product" to="/supplier/products/new" accent="secondary" />
        <QuickActionCard title="Manage Products" description="View and edit catalog" to="/supplier/products" />
        <QuickActionCard title="View Orders" description="Incoming purchase orders" to="/supplier/orders" accent="secondary" />
        <QuickActionCard title="Update Inventory" description="Review stock levels" to="/supplier/products" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Sales Summary</h2>
          </div>
          {data.sales_summary.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">No sales data yet.</p>
          ) : (
            <div className="p-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.sales_summary}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatTZS(Number(v ?? 0), data.currency)} />
                  <Bar dataKey="amount" fill="#1E7D45" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Low Stock Alerts</h2>
          </div>
          <DataTable
            rows={data.low_stock_alerts}
            emptyMessage="All products are adequately stocked."
            columns={[
              { key: 'product_name', header: 'Product' },
              { key: 'stock', header: 'Stock' },
              { key: 'threshold', header: 'Threshold' },
            ]}
          />
        </section>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">My Products</h2>
        </div>
        <DataTable
          rows={data.my_products}
          emptyMessage="No products listed yet."
          columns={[
            {
              key: 'name',
              header: 'Product',
              render: (r) => (
                <Link
                  to={`/supplier/products/${String(r.id)}/edit`}
                  className="font-medium text-secondary hover:underline"
                >
                  {String(r.name)}
                </Link>
              ),
            },
            {
              key: 'price',
              header: 'Price',
              render: (r) => formatTZS(String(r.price), String(r.currency)),
            },
            { key: 'stock', header: 'Stock' },
            {
              key: 'is_active',
              header: 'Status',
              render: (r) => (
                <StatusBadge status={r.is_active ? 'VERIFIED' : 'SUSPENDED'} />
              ),
            },
          ]}
        />
      </section>

      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Recent Orders</h2>
        </div>
        <DataTable
          rows={data.recent_orders}
          emptyMessage="No orders received yet."
          columns={[
            {
              key: 'id',
              header: 'Order',
              render: (r) => String(r.id).slice(0, 8).toUpperCase(),
            },
            { key: 'organisation_id', header: 'Hospital' },
            {
              key: 'total_amount',
              header: 'Amount',
              render: (r) => formatTZS(String(r.total_amount), String(r.currency)),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <StatusBadge status={String(r.status)} />,
            },
          ]}
        />
      </section>
    </div>
  );
};

export default SupplierDashboardPage;
