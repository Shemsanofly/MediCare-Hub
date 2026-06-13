import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { marketplaceApi } from '@/api';
import DataTable from '@/components/dashboard/DataTable';
import ErrorMessage from '@/components/dashboard/ErrorMessage';
import LoadingSpinner from '@/components/dashboard/LoadingSpinner';
import StatusBadge from '@/components/dashboard/StatusBadge';
import { extractErrorMessage } from '@/api/axiosConfig';
import type { ProductBatch } from '@/types';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';

const formatTZS = (amount: string | number) =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency: 'TZS',
    maximumFractionDigits: 0,
  }).format(Number(amount));

const SupplierProductBatchesPage = () => {
  const { productId } = useParams<{ productId: string }>();

  const productQuery = useQuery({
    queryKey: ['supplierProduct', productId],
    queryFn: async () => {
      const { data } = await marketplaceApi.getProduct(productId!);
      return data;
    },
    enabled: Boolean(productId),
  });

  const batchesQuery = useQuery({
    queryKey: ['productBatches', productId],
    queryFn: async () => {
      const { data } = await marketplaceApi.listBatches(productId!);
      return data.results;
    },
    enabled: Boolean(productId),
  });

  if (productQuery.isLoading || batchesQuery.isLoading) {
    return <LoadingSpinner label="Loading batches…" />;
  }

  if (productQuery.isError || batchesQuery.isError) {
    return (
      <ErrorMessage
        message={extractErrorMessage(
          (productQuery.error ?? batchesQuery.error) as AxiosError<ApiErrorResponse>,
        )}
        onRetry={() => {
          void productQuery.refetch();
          void batchesQuery.refetch();
        }}
      />
    );
  }

  const product = productQuery.data!;
  const batches = batchesQuery.data ?? [];
  const lowStock = batches.filter((batch) => batch.status === 'LOW_STOCK');
  const expiringSoon = batches.filter((batch) => {
    const days =
      (new Date(batch.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days <= 60 && batch.status !== 'EXPIRED';
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/supplier/products"
            className="text-sm text-primary hover:underline"
          >
            ← Back to products
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            Batches — {product.name}
          </h1>
          <p className="text-sm text-gray-500">
            {product.total_quantity_available} units available across{' '}
            {batches.length} batch{batches.length === 1 ? '' : 'es'}
          </p>
        </div>
        <Link
          to={`/supplier/products/${productId}/batches/new`}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
        >
          Add batch
        </Link>
      </div>

      {(lowStock.length > 0 || expiringSoon.length > 0) && (
        <div className="space-y-3">
          {lowStock.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {lowStock.length} batch{lowStock.length === 1 ? '' : 'es'} below low-stock
              threshold (&lt; 50 units).
            </div>
          )}
          {expiringSoon.length > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
              {expiringSoon.length} batch{expiringSoon.length === 1 ? '' : 'es'} expiring
              within 60 days.
            </div>
          )}
        </div>
      )}

      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        {batches.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">
            No inventory batches yet. Add a batch to make this product available for
            orders.
          </p>
        ) : (
          <DataTable
            rows={batches}
            columns={[
              { key: 'batch_number', header: 'Batch #' },
              {
                key: 'expiry_date',
                header: 'Expiry',
                render: (row) => new Date(String(row.expiry_date)).toLocaleDateString(),
              },
              {
                key: 'quantity',
                header: 'On hand',
                render: (row) => String((row as ProductBatch).quantity ?? '—'),
              },
              {
                key: 'available_quantity',
                header: 'Available',
                render: (row) => String(row.available_quantity),
              },
              {
                key: 'unit_cost',
                header: 'Unit cost',
                render: (row) =>
                  row.unit_cost ? formatTZS(row.unit_cost) : '—',
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <StatusBadge status={String(row.status)} />,
              },
              {
                key: 'id',
                header: '',
                render: (row) => (
                  <Link
                    to={`/supplier/products/${productId}/batches/${String(row.id)}/edit`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Edit
                  </Link>
                ),
              },
            ]}
          />
        )}
      </section>
    </div>
  );
};

export default SupplierProductBatchesPage;
