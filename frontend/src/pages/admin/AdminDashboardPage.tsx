import { useQuery } from '@tanstack/react-query';
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
import { ChartContainer, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';

const formatTZS = (amount: string | number, currency = 'TZS') =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));

const revenueChartConfig = {
  amount: {
    label: 'Revenue',
    color: '#1B4F8C',
  },
} satisfies ChartConfig;

const AdminDashboardPage = () => {
  const summaryQuery = useQuery({
    queryKey: ['adminDashboard'],
    queryFn: async () => {
      const { data } = await dashboardApi.getAdminSummary();
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
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Users" value={data.total_users} accent="primary" />
        <StatCard title="Hospitals" value={data.total_hospitals} accent="secondary" />
        <StatCard title="Suppliers" value={data.total_suppliers} accent="accent" />
        <StatCard title="Pending Verifications" value={data.pending_verifications} accent="accent" />
        <StatCard title="Total Products" value={data.total_products} accent="primary" />
        <StatCard title="Total Orders" value={data.total_orders} accent="secondary" />
        <StatCard
          title="Platform Revenue"
          value={formatTZS(data.platform_revenue, data.currency)}
          accent="primary"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickActionCard title="Manage Users" description="View platform users" to="/admin/users" />
        <QuickActionCard title="Verify Suppliers" description="Review pending suppliers" to="/admin/suppliers" accent="secondary" />
        <QuickActionCard title="Manage Products" description="Review marketplace listings" to="/admin/products" />
        <QuickActionCard title="View Orders" description="Platform order activity" to="/admin/orders" accent="secondary" />
      </section>

      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-gray-900">Revenue Overview</h2>
            <p className="mt-1 text-sm text-gray-500">MediCare fees from completed payments</p>
          </div>
          <div className="rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-right">
            <p className="text-xs font-medium text-primary-700">Total</p>
            <p className="text-sm font-semibold text-primary">
              {formatTZS(data.platform_revenue, data.currency)}
            </p>
          </div>
        </div>
        {data.revenue_overview.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No revenue data yet.</p>
        ) : (
          <div className="p-5">
            <ChartContainer config={revenueChartConfig}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.revenue_overview} margin={{ left: 0, right: 10, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={72}
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickFormatter={(value) => formatTZS(value, data.currency)}
                  />
                  <Tooltip
                    cursor={{ fill: '#EBF2FA' }}
                    content={({ active, payload, label }) => (
                      <ChartTooltipContent
                        active={active}
                        payload={payload}
                        label={label}
                        config={revenueChartConfig}
                        valueFormatter={(value) => formatTZS(value, data.currency)}
                      />
                    )}
                  />
                  <Bar
                    dataKey="amount"
                    fill="var(--color-amount)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={52}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Recent Users</h2>
          </div>
          <DataTable
            rows={data.recent_users}
            emptyMessage="No users registered yet."
            columns={[
              { key: 'email', header: 'Email' },
              { key: 'role', header: 'Role' },
              { key: 'organisation_name', header: 'Organisation' },
            ]}
          />
        </section>

        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Supplier Verification Requests</h2>
          </div>
          <DataTable
            rows={data.verification_requests}
            emptyMessage="No pending verifications."
            columns={[
              { key: 'organisation_name', header: 'Supplier' },
              {
                key: 'verification_status',
                header: 'Status',
                render: (r) => <StatusBadge status={String(r.verification_status)} />,
              },
            ]}
          />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Recent Orders</h2>
          </div>
          <DataTable
            rows={data.recent_orders}
            emptyMessage="No platform orders yet."
            columns={[
              {
                key: 'id',
                header: 'Order',
                render: (r) => String(r.id).slice(0, 8).toUpperCase(),
              },
              { key: 'supplier_name', header: 'Supplier' },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <StatusBadge status={String(r.status)} />,
              },
            ]}
          />
        </section>

        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Product Activity</h2>
          </div>
          <DataTable
            rows={data.product_activity}
            emptyMessage="No product activity yet."
            columns={[
              { key: 'name', header: 'Product' },
              { key: 'supplier_name', header: 'Supplier' },
              {
                key: 'is_active',
                header: 'Active',
                render: (r) => (r.is_active ? 'Yes' : 'No'),
              },
            ]}
          />
        </section>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">System Activity Logs</h2>
        </div>
        <DataTable
          rows={data.activity_logs}
          emptyMessage="No activity logs yet."
          columns={[
            { key: 'action', header: 'Action' },
            { key: 'user_email', header: 'User' },
            {
              key: 'created_at',
              header: 'Time',
              render: (r) => new Date(String(r.created_at)).toLocaleString(),
            },
          ]}
        />
      </section>
    </div>
  );
};

export default AdminDashboardPage;
