import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { adminApi, type AdminSupplier } from '@/api/adminApi';
import { extractErrorMessage } from '@/api/axiosConfig';
import {
  AdminDetailModal,
  AdminFilterBar,
  AdminTable,
  ConfirmActionModal,
  SearchInput,
  StatusBadge,
} from '@/components/admin';
import ErrorMessage from '@/components/dashboard/ErrorMessage';
import LoadingSpinner from '@/components/dashboard/LoadingSpinner';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';

const AdminSuppliersPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<AdminSupplier | null>(null);
  const [confirmAction, setConfirmAction] = useState<'verify' | 'reject' | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const queryParams = useMemo(
    () => ({
      ...(search ? { search } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    }),
    [search, statusFilter],
  );

  const suppliersQuery = useQuery({
    queryKey: ['adminSuppliers', queryParams],
    queryFn: async () => {
      const { data } = await adminApi.listSuppliers(queryParams);
      return data.results;
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (supplierId: string) => adminApi.verifySupplier(supplierId),
    onSuccess: (response) => {
      toast.success('Supplier verified.');
      setConfirmAction(null);
      setSelectedSupplier(response.data);
      void queryClient.invalidateQueries({ queryKey: ['adminSuppliers'] });
      void queryClient.invalidateQueries({ queryKey: ['adminDashboard'] });
    },
    onError: (error: AxiosError<ApiErrorResponse>) => {
      toast.error(extractErrorMessage(error));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ supplierId, reason }: { supplierId: string; reason: string }) =>
      adminApi.rejectSupplier(supplierId, reason),
    onSuccess: (response) => {
      toast.success('Supplier rejected.');
      setConfirmAction(null);
      setRejectReason('');
      setSelectedSupplier(response.data);
      void queryClient.invalidateQueries({ queryKey: ['adminSuppliers'] });
      void queryClient.invalidateQueries({ queryKey: ['adminDashboard'] });
    },
    onError: (error: AxiosError<ApiErrorResponse>) => {
      toast.error(extractErrorMessage(error));
    },
  });

  if (suppliersQuery.isLoading) {
    return <LoadingSpinner label="Loading suppliers…" />;
  }

  if (suppliersQuery.isError) {
    return (
      <ErrorMessage
        message={extractErrorMessage(
          suppliersQuery.error as AxiosError<ApiErrorResponse>,
        )}
        onRetry={() => void suppliersQuery.refetch()}
      />
    );
  }

  const suppliers = suppliersQuery.data ?? [];
  const pendingCount = suppliers.filter((s) => s.verification_status === 'PENDING').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Supplier Verification</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review supplier registrations and approve or reject verification requests.
        </p>
        {statusFilter === 'PENDING' || statusFilter === '' ? (
          <p className="mt-2 text-sm font-medium text-amber-700">
            {pendingCount} pending verification request{pendingCount === 1 ? '' : 's'}{' '}
            {statusFilter === '' ? 'in current results' : ''}
          </p>
        ) : null}
      </div>

      <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by organisation or license…"
        />
        <AdminFilterBar
          filters={[
            {
              id: 'status',
              label: 'Verification status',
              value: statusFilter,
              options: [
                { value: '', label: 'All statuses' },
                { value: 'PENDING', label: 'Pending' },
                { value: 'VERIFIED', label: 'Verified' },
                { value: 'REJECTED', label: 'Rejected' },
                { value: 'SUSPENDED', label: 'Suspended' },
              ],
              onChange: setStatusFilter,
            },
          ]}
        />
      </div>

      <AdminTable
        rows={suppliers}
        emptyMessage="No suppliers match your filters."
        onRowClick={setSelectedSupplier}
        columns={[
          { key: 'organisation_name', header: 'Organisation' },
          { key: 'brela_registration_number', header: 'BRELA No.' },
          { key: 'tmda_license_number', header: 'TMDA License' },
          {
            key: 'verification_status',
            header: 'Status',
            render: (row) => <StatusBadge status={row.verification_status} />,
          },
          {
            key: 'created_at',
            header: 'Registered',
            render: (row) => new Date(row.created_at).toLocaleDateString(),
          },
        ]}
      />

      <AdminDetailModal
        title="Supplier Details"
        open={Boolean(selectedSupplier)}
        onClose={() => {
          setSelectedSupplier(null);
          setConfirmAction(null);
          setRejectReason('');
        }}
        actions={
          selectedSupplier?.verification_status === 'PENDING' ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmAction('reject')}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction('verify')}
                className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white hover:bg-secondary-600"
              >
                Approve
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSelectedSupplier(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          )
        }
      >
        {selectedSupplier && (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">Organisation</dt>
              <dd className="font-medium text-gray-900">
                {selectedSupplier.organisation_name}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Verification status</dt>
              <dd>
                <StatusBadge status={selectedSupplier.verification_status} />
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">BRELA registration</dt>
              <dd className="font-medium text-gray-900">
                {selectedSupplier.brela_registration_number || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">TMDA license</dt>
              <dd className="font-medium text-gray-900">
                {selectedSupplier.tmda_license_number || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">License expiry</dt>
              <dd className="font-medium text-gray-900">
                {selectedSupplier.license_expiry_date
                  ? new Date(selectedSupplier.license_expiry_date).toLocaleDateString()
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Documents</dt>
              <dd className="font-medium text-gray-900">
                {selectedSupplier.has_required_documents ? 'Complete' : 'Incomplete'}
              </dd>
            </div>
            {selectedSupplier.rejection_reason ? (
              <div className="sm:col-span-2">
                <dt className="text-gray-500">Rejection reason</dt>
                <dd className="font-medium text-gray-900">
                  {selectedSupplier.rejection_reason}
                </dd>
              </div>
            ) : null}
          </dl>
        )}
      </AdminDetailModal>

      <ConfirmActionModal
        open={confirmAction === 'verify'}
        title="Approve supplier"
        message={`Approve ${selectedSupplier?.organisation_name} for marketplace access?`}
        confirmLabel="Approve"
        confirmTone="primary"
        isLoading={verifyMutation.isPending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!selectedSupplier) return;
          verifyMutation.mutate(selectedSupplier.id);
        }}
      />

      {confirmAction === 'reject' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Reject supplier</h3>
            <p className="mt-2 text-sm text-gray-600">
              Provide a reason for rejecting {selectedSupplier?.organisation_name} (min 10
              characters).
            </p>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={4}
              className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Reason for rejection…"
            />
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmAction(null);
                  setRejectReason('');
                }}
                className="flex-1 rounded-lg border border-gray-300 py-2 font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectReason.trim().length < 10 || rejectMutation.isPending}
                onClick={() => {
                  if (!selectedSupplier) return;
                  rejectMutation.mutate({
                    supplierId: selectedSupplier.id,
                    reason: rejectReason.trim(),
                  });
                }}
                className="flex-1 rounded-lg bg-red-600 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {rejectMutation.isPending ? 'Processing…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSuppliersPage;
