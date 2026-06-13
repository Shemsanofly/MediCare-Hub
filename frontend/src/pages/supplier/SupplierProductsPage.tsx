import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { dashboardApi, marketplaceApi } from '@/api';
import DataTable from '@/components/dashboard/DataTable';
import EmptyState from '@/components/dashboard/EmptyState';
import ErrorMessage from '@/components/dashboard/ErrorMessage';
import LoadingSpinner from '@/components/dashboard/LoadingSpinner';
import StatusBadge from '@/components/dashboard/StatusBadge';
import { extractErrorMessage } from '@/api/axiosConfig';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';

const formatTZS = (amount: string | number) =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency: 'TZS',
    maximumFractionDigits: 0,
  }).format(Number(amount));

const SupplierProductsPage = () => {
  const queryClient = useQueryClient();

  const summaryQuery = useQuery({
    queryKey: ['supplierDashboard'],
    queryFn: async () => {
      const { data } = await dashboardApi.getSupplierSummary();
      return data;
    },
  });

  const productsQuery = useQuery({
    queryKey: ['supplierProducts', summaryQuery.data?.supplier_id],
    queryFn: async () => {
      const supplierId = summaryQuery.data?.supplier_id;
      if (!supplierId) return [];
      const { data } = await marketplaceApi.getProducts({
        supplier: supplierId,
        page_size: 100,
        valid_expiry: 'false',
      });
      return data.results ?? [];
    },
    enabled: Boolean(summaryQuery.data?.supplier_id),
  });

  const deleteMutation = useMutation({
    mutationFn: (productId: string) => marketplaceApi.deleteProduct(productId),
    onSuccess: () => {
      toast.success('Product deleted.');
      void queryClient.invalidateQueries({ queryKey: ['supplierProducts'] });
      void queryClient.invalidateQueries({ queryKey: ['supplierDashboard'] });
    },
  });

  if (summaryQuery.isLoading || productsQuery.isLoading) {
    return <LoadingSpinner label="Loading products…" />;
  }

  if (summaryQuery.isError || productsQuery.isError) {
    const err = (summaryQuery.error ?? productsQuery.error) as AxiosError<ApiErrorResponse>;
    return (
      <ErrorMessage
        message={extractErrorMessage(err)}
        onRetry={() => {
          void summaryQuery.refetch();
          void productsQuery.refetch();
        }}
      />
    );
  }

  const products = productsQuery.data ?? [];

  if (products.length === 0) {
    return (
      <EmptyState
        title="No products listed"
        description="Add your first product to start receiving orders."
        action={
          <Link
            to="/supplier/products/new"
            className="inline-block rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white hover:bg-secondary-600"
          >
            Add Product
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Products</h1>
          <p className="text-sm text-gray-500">{products.length} products in catalog</p>
        </div>
        <Link
          to="/supplier/products/new"
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white hover:bg-secondary-600"
        >
          Add Product
        </Link>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <DataTable
          rows={products}
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
              render: (r) => formatTZS(String(r.price)),
            },
            {
              key: 'total_quantity_available',
              header: 'Stock',
            },
            {
              key: 'is_active',
              header: 'Status',
              render: (r) => (
                <StatusBadge status={r.is_active ? 'VERIFIED' : 'SUSPENDED'} />
              ),
            },
            {
              key: 'batches',
              header: 'Inventory',
              render: (r) => (
                <Link
                  to={`/supplier/products/${String(r.id)}/batches`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Manage batches
                </Link>
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              render: (r) => (
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(String(r.id))}
                  disabled={deleteMutation.isPending}
                  className="text-sm font-medium text-red-600 hover:text-red-800"
                >
                  Delete
                </button>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
};

export default SupplierProductsPage;
