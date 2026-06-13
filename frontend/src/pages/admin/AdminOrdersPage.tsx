import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { adminApi, type AdminOrder } from '@/api/adminApi';
import { extractErrorMessage } from '@/api/axiosConfig';
import {
  AdminDetailModal,
  AdminFilterBar,
  AdminTable,
  SearchInput,
  StatusBadge,
} from '@/components/admin';
import ErrorMessage from '@/components/dashboard/ErrorMessage';
import LoadingSpinner from '@/components/dashboard/LoadingSpinner';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';

const formatTZS = (amount: string | number, currency = 'TZS') =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));

const AdminOrdersPage = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);

  const queryParams = useMemo(
    () => ({
      ...(search ? { search } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    }),
    [search, statusFilter],
  );

  const ordersQuery = useQuery({
    queryKey: ['adminOrders', queryParams],
    queryFn: async () => {
      const { data } = await adminApi.listOrders(queryParams);
      return data.results;
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Order Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitor platform orders, payment status, and procurement progress.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by order ID, hospital, or supplier…"
        />
        <AdminFilterBar
          filters={[
            {
              id: 'status',
              label: 'Order status',
              value: statusFilter,
              options: [
                { value: '', label: 'All statuses' },
                { value: 'PENDING', label: 'Pending' },
                { value: 'APPROVED', label: 'Approved' },
                { value: 'CONFIRMED', label: 'Confirmed' },
                { value: 'PAID', label: 'Paid' },
                { value: 'PROCESSING', label: 'Processing' },
                { value: 'SHIPPED', label: 'Shipped' },
                { value: 'DELIVERED', label: 'Delivered' },
                { value: 'COMPLETED', label: 'Completed' },
                { value: 'CANCELLED', label: 'Cancelled' },
                { value: 'DISPUTED', label: 'Disputed' },
              ],
              onChange: setStatusFilter,
            },
          ]}
        />
      </div>

      <AdminTable
        rows={orders}
        emptyMessage="No orders match your filters."
        onRowClick={setSelectedOrder}
        columns={[
          {
            key: 'id',
            header: 'Order',
            render: (row) => row.id.slice(0, 8).toUpperCase(),
          },
          { key: 'hospital_name', header: 'Hospital' },
          { key: 'supplier_name', header: 'Supplier' },
          {
            key: 'total_amount',
            header: 'Total',
            render: (row) => formatTZS(row.total_amount, row.currency),
          },
          {
            key: 'status',
            header: 'Order status',
            render: (row) => <StatusBadge status={row.status} />,
          },
          {
            key: 'payment_status',
            header: 'Payment',
            render: (row) => <StatusBadge status={row.payment_status || 'PENDING'} />,
          },
          {
            key: 'created_at',
            header: 'Date',
            render: (row) => new Date(row.created_at).toLocaleDateString(),
          },
        ]}
      />

      <AdminDetailModal
        title="Order Details"
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        actions={
          <button
            type="button"
            onClick={() => setSelectedOrder(null)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        }
      >
        {selectedOrder && (
          <div className="space-y-6">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">Order ID</dt>
                <dd className="font-medium text-gray-900">{selectedOrder.id}</dd>
              </div>
              <div>
                <dt className="text-gray-500">LPO number</dt>
                <dd className="font-medium text-gray-900">
                  {selectedOrder.lpo_number || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Hospital</dt>
                <dd className="font-medium text-gray-900">
                  {selectedOrder.hospital_name}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Supplier</dt>
                <dd className="font-medium text-gray-900">
                  {selectedOrder.supplier_name}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Order status</dt>
                <dd>
                  <StatusBadge status={selectedOrder.status} />
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Payment status</dt>
                <dd>
                  <StatusBadge status={selectedOrder.payment_status || 'PENDING'} />
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Subtotal</dt>
                <dd className="font-medium text-gray-900">
                  {formatTZS(selectedOrder.subtotal, selectedOrder.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Total</dt>
                <dd className="font-medium text-gray-900">
                  {formatTZS(selectedOrder.total_amount, selectedOrder.currency)}
                </dd>
              </div>
              {selectedOrder.payment_amount ? (
                <div>
                  <dt className="text-gray-500">Payment amount</dt>
                  <dd className="font-medium text-gray-900">
                    {formatTZS(selectedOrder.payment_amount, selectedOrder.currency)}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-gray-500">Created</dt>
                <dd className="font-medium text-gray-900">
                  {new Date(selectedOrder.created_at).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Payment terms</dt>
                <dd className="font-medium text-gray-900">
                  {selectedOrder.payment_terms || '—'}
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Line items</h3>
              {selectedOrder.items.length === 0 ? (
                <p className="text-sm text-gray-500">No line items.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Product</th>
                        <th className="px-3 py-2 font-medium">Qty</th>
                        <th className="px-3 py-2 font-medium">Unit price</th>
                        <th className="px-3 py-2 font-medium">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items.map((item) => (
                        <tr key={item.id} className="border-t border-gray-100">
                          <td className="px-3 py-2">{item.product_name}</td>
                          <td className="px-3 py-2">{item.quantity_ordered}</td>
                          <td className="px-3 py-2">
                            {formatTZS(item.unit_price, selectedOrder.currency)}
                          </td>
                          <td className="px-3 py-2">
                            {formatTZS(item.subtotal, selectedOrder.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </AdminDetailModal>
    </div>
  );
};

export default AdminOrdersPage;
