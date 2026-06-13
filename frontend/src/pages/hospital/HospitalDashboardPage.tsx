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
import DataTable from '@/components/dashboard/DataTable';
import ErrorMessage from '@/components/dashboard/ErrorMessage';
import LoadingSpinner from '@/components/dashboard/LoadingSpinner';
import QuickActionCard from '@/components/dashboard/QuickActionCard';
import StatCard from '@/components/dashboard/StatCard';
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

const HospitalDashboardPage = () => {
  const summaryQuery = useQuery({
    queryKey: ['hospitalDashboard'],
    queryFn: async () => {
      const { data } = await dashboardApi.getHospitalSummary();
      return data;
    },
  });

  if (summaryQuery.isLoading) {
    return <LoadingSpinner />;
  }

  if (summaryQuery.isError) {
    const message = extractErrorMessage(
      summaryQuery.error as AxiosError<ApiErrorResponse>,
    );
    return (
      <ErrorMessage
        message={message}
        onRetry={() => void summaryQuery.refetch()}
      />
    );
  }

  const data = summaryQuery.data!;

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Total Orders" value={data.total_orders} accent="primary" />
        <StatCard title="Pending Orders" value={data.pending_orders} accent="accent" />
        <StatCard title="Delivered Orders" value={data.delivered_orders} accent="secondary" />
        <StatCard
          title="Monthly Spending"
          value={formatTZS(data.monthly_spending, data.currency)}
          accent="primary"
        />
        <StatCard title="Cart Items" value={data.cart_items} accent="accent" />
        <StatCard
          title="Recent Payments"
          value={data.recent_payments.length}
          subtitle="Last 5 transactions"
          accent="secondary"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuickActionCard title="Browse Marketplace" description="Search medical supplies" to="/marketplace" />
        <QuickActionCard title="View Cart" description="Review cart items" to="/hospital/cart" accent="secondary" />
        <QuickActionCard title="Checkout" description="Place procurement order" to="/hospital/checkout" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Procurement Spending Overview</h2>
          </div>
          {data.spending_overview.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">No spending data yet.</p>
          ) : (
            <div className="p-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.spending_overview}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatTZS(Number(v ?? 0), data.currency)} />
                  <Bar dataKey="amount" fill="#1B4F8C" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Order Status Breakdown</h2>
          </div>
          <DataTable
            rows={data.status_breakdown}
            emptyMessage="No orders yet."
            columns={[
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> },
              { key: 'count', header: 'Count' },
            ]}
          />
        </section>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Recent Orders</h2>
        </div>
        <DataTable
          rows={data.recent_orders}
          emptyMessage="No orders placed yet."
          columns={[
            {
              key: 'id',
              header: 'Order',
              render: (r) => (
                <Link
                  to={`/hospital/orders/${String(r.id)}`}
                  className="font-medium text-primary hover:underline"
                >
                  {String(r.id).slice(0, 8).toUpperCase()}
                </Link>
              ),
            },
            { key: 'supplier_name', header: 'Supplier' },
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

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Top Suppliers</h2>
          </div>
          <DataTable
            rows={data.top_suppliers}
            emptyMessage="No supplier activity yet."
            columns={[
              { key: 'supplier_name', header: 'Supplier' },
              { key: 'order_count', header: 'Orders' },
              {
                key: 'total_spent',
                header: 'Total Spent',
                render: (r) => formatTZS(String(r.total_spent), data.currency),
              },
            ]}
          />
        </section>

        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Recent Products Ordered</h2>
          </div>
          <DataTable
            rows={data.recent_products_ordered}
            emptyMessage="No products ordered yet."
            columns={[
              { key: 'product_name', header: 'Product' },
              { key: 'quantity', header: 'Qty' },
              {
                key: 'ordered_at',
                header: 'Date',
                render: (r) => new Date(String(r.ordered_at)).toLocaleDateString(),
              },
            ]}
          />
        </section>
      </div>
    </div>
  );
};

export default HospitalDashboardPage;
