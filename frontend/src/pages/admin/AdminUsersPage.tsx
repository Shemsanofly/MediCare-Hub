import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { adminApi } from '@/api/adminApi';
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
import type { User } from '@/types';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';

const AdminUsersPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [confirmAction, setConfirmAction] = useState<'activate' | 'deactivate' | null>(
    null,
  );

  const queryParams = useMemo(
    () => ({
      ...(search ? { search } : {}),
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(activeFilter ? { is_active: activeFilter } : {}),
    }),
    [search, roleFilter, activeFilter],
  );

  const usersQuery = useQuery({
    queryKey: ['adminUsers', queryParams],
    queryFn: async () => {
      const { data } = await adminApi.listUsers(queryParams);
      return data.results;
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      adminApi.updateUser(userId, { is_active: isActive }),
    onSuccess: (response) => {
      toast.success(
        response.data.is_active ? 'User activated.' : 'User deactivated.',
      );
      setConfirmAction(null);
      setSelectedUser(response.data);
      void queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
    },
    onError: (error: AxiosError<ApiErrorResponse>) => {
      toast.error(extractErrorMessage(error));
    },
  });

  if (usersQuery.isLoading) {
    return <LoadingSpinner label="Loading users…" />;
  }

  if (usersQuery.isError) {
    return (
      <ErrorMessage
        message={extractErrorMessage(usersQuery.error as AxiosError<ApiErrorResponse>)}
        onRetry={() => void usersQuery.refetch()}
      />
    );
  }

  const users = usersQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          View and manage platform users, roles, and account status.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by email or name…"
        />
        <AdminFilterBar
          filters={[
            {
              id: 'role',
              label: 'Role',
              value: roleFilter,
              options: [
                { value: '', label: 'All roles' },
                { value: 'HOSPITAL', label: 'Hospital' },
                { value: 'SUPPLIER', label: 'Supplier' },
                { value: 'ADMIN', label: 'Admin' },
              ],
              onChange: setRoleFilter,
            },
            {
              id: 'status',
              label: 'Status',
              value: activeFilter,
              options: [
                { value: '', label: 'All statuses' },
                { value: 'true', label: 'Active' },
                { value: 'false', label: 'Inactive' },
              ],
              onChange: setActiveFilter,
            },
          ]}
        />
      </div>

      <AdminTable
        rows={users}
        emptyMessage="No users match your filters."
        onRowClick={setSelectedUser}
        columns={[
          { key: 'email', header: 'Email' },
          { key: 'full_name', header: 'Name' },
          {
            key: 'role',
            header: 'Role',
            render: (row) => <StatusBadge status={row.role} />,
          },
          {
            key: 'organisation',
            header: 'Organisation',
            render: (row) => row.organisation?.name ?? '—',
          },
          {
            key: 'is_active',
            header: 'Status',
            render: (row) => (
              <StatusBadge status={row.is_active ? 'ACTIVE' : 'INACTIVE'} />
            ),
          },
          {
            key: 'created_at',
            header: 'Joined',
            render: (row) => new Date(row.created_at).toLocaleDateString(),
          },
        ]}
      />

      <AdminDetailModal
        title="User Details"
        open={Boolean(selectedUser)}
        onClose={() => {
          setSelectedUser(null);
          setConfirmAction(null);
        }}
        actions={
          selectedUser ? (
            <>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              {selectedUser.is_active ? (
                <button
                  type="button"
                  onClick={() => setConfirmAction('deactivate')}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Deactivate
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmAction('activate')}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
                >
                  Activate
                </button>
              )}
            </>
          ) : undefined
        }
      >
        {selectedUser && (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">Email</dt>
              <dd className="font-medium text-gray-900">{selectedUser.email}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Full name</dt>
              <dd className="font-medium text-gray-900">{selectedUser.full_name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Role</dt>
              <dd>
                <StatusBadge status={selectedUser.role} />
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Account status</dt>
              <dd>
                <StatusBadge status={selectedUser.is_active ? 'ACTIVE' : 'INACTIVE'} />
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Organisation</dt>
              <dd className="font-medium text-gray-900">
                {selectedUser.organisation?.name ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Verified</dt>
              <dd className="font-medium text-gray-900">
                {selectedUser.is_verified ? 'Yes' : 'No'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Created</dt>
              <dd className="font-medium text-gray-900">
                {new Date(selectedUser.created_at).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Last updated</dt>
              <dd className="font-medium text-gray-900">
                {new Date(selectedUser.updated_at).toLocaleString()}
              </dd>
            </div>
          </dl>
        )}
      </AdminDetailModal>

      <ConfirmActionModal
        open={confirmAction !== null}
        title={confirmAction === 'deactivate' ? 'Deactivate user' : 'Activate user'}
        message={
          confirmAction === 'deactivate'
            ? `Deactivate ${selectedUser?.email}? They will no longer be able to sign in.`
            : `Activate ${selectedUser?.email}? They will regain access to the platform.`
        }
        confirmLabel={confirmAction === 'deactivate' ? 'Deactivate' : 'Activate'}
        confirmTone={confirmAction === 'deactivate' ? 'danger' : 'primary'}
        isLoading={statusMutation.isPending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!selectedUser || !confirmAction) return;
          statusMutation.mutate({
            userId: selectedUser.id,
            isActive: confirmAction === 'activate',
          });
        }}
      />
    </div>
  );
};

export default AdminUsersPage;
