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
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';

const formatTZS = (amount: string | number, currency = 'TZS') =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));

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
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Revenue Overview</h2>
        </div>
        {data.revenue_overview.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No revenue data yet.</p>
        ) : (
          <div className="p-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.revenue_overview}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatTZS(Number(v ?? 0), data.currency)} />
                <Bar dataKey="amount" fill="#D68910" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
