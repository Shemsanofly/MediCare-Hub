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
import type { Product } from '@/types';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';

const formatTZS = (amount: string | number, currency = 'TZS') =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));

const AdminProductsPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [confirmAction, setConfirmAction] = useState<'deactivate' | 'delete' | null>(
    null,
  );

  const queryParams = useMemo(
    () => ({
      ...(search ? { search } : {}),
      ...(categoryFilter ? { category: categoryFilter } : {}),
      ...(supplierFilter ? { supplier: supplierFilter } : {}),
      ...(stockFilter ? { stock_status: stockFilter } : {}),
      ...(activeFilter ? { is_active: activeFilter } : {}),
    }),
    [search, categoryFilter, supplierFilter, stockFilter, activeFilter],
  );

  const productsQuery = useQuery({
    queryKey: ['adminProducts', queryParams],
    queryFn: async () => {
      const { data } = await adminApi.listProducts(queryParams);
      return data.results;
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (productId: string) =>
      adminApi.updateProduct(productId, { is_active: false }),
    onSuccess: (response) => {
      toast.success('Product deactivated.');
      setConfirmAction(null);
      setSelectedProduct(response.data);
      void queryClient.invalidateQueries({ queryKey: ['adminProducts'] });
    },
    onError: (error: AxiosError<ApiErrorResponse>) => {
      toast.error(extractErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (productId: string) => adminApi.deleteProduct(productId),
    onSuccess: () => {
      toast.success('Product removed.');
      setConfirmAction(null);
      setSelectedProduct(null);
      void queryClient.invalidateQueries({ queryKey: ['adminProducts'] });
    },
    onError: (error: AxiosError<ApiErrorResponse>) => {
      toast.error(extractErrorMessage(error));
    },
  });

  const categoryOptions = useMemo(() => {
    const products = productsQuery.data ?? [];
    const categories = new Map<string, string>();
    products.forEach((product) => {
      if (product.category) {
        categories.set(product.category.id, product.category.name);
      }
    });
    return [
      { value: '', label: 'All categories' },
      ...Array.from(categories.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [productsQuery.data]);

  const supplierOptions = useMemo(() => {
    const products = productsQuery.data ?? [];
    const suppliers = new Map<string, string>();
    products.forEach((product) => {
      if (product.supplier) {
        suppliers.set(product.supplier.id, product.supplier.organisation_name);
      }
    });
    return [
      { value: '', label: 'All suppliers' },
      ...Array.from(suppliers.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [productsQuery.data]);

  if (productsQuery.isLoading) {
    return <LoadingSpinner label="Loading products…" />;
  }

  if (productsQuery.isError) {
    return (
      <ErrorMessage
        message={extractErrorMessage(
          productsQuery.error as AxiosError<ApiErrorResponse>,
        )}
        onRetry={() => void productsQuery.refetch()}
      />
    );
  }

  const products = productsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Product Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review marketplace products, stock levels, and supplier listings.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by product name or GTIN…"
        />
        <AdminFilterBar
          filters={[
            {
              id: 'category',
              label: 'Category',
              value: categoryFilter,
              options: categoryOptions,
              onChange: setCategoryFilter,
            },
            {
              id: 'supplier',
              label: 'Supplier',
              value: supplierFilter,
              options: supplierOptions,
              onChange: setSupplierFilter,
            },
            {
              id: 'stock',
              label: 'Stock',
              value: stockFilter,
              options: [
                { value: '', label: 'All stock levels' },
                { value: 'in', label: 'In stock' },
                { value: 'low', label: 'Low stock' },
                { value: 'out', label: 'Out of stock' },
              ],
              onChange: setStockFilter,
            },
            {
              id: 'active',
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
        rows={products}
        emptyMessage="No products match your filters."
        onRowClick={setSelectedProduct}
        columns={[
          { key: 'name', header: 'Product' },
          {
            key: 'supplier',
            header: 'Supplier',
            render: (row) => row.supplier?.organisation_name ?? '—',
          },
          {
            key: 'category',
            header: 'Category',
            render: (row) => row.category?.name ?? '—',
          },
          {
            key: 'price',
            header: 'Price',
            render: (row) => formatTZS(row.price, row.currency),
          },
          {
            key: 'inventory_status',
            header: 'Inventory',
            render: (row) => (
              <StatusBadge
                status={row.inventory_status ?? (row.total_quantity_available > 0 ? 'ACTIVE' : 'OUT_OF_STOCK')}
              />
            ),
          },
          {
            key: 'total_quantity_available',
            header: 'Stock',
            render: (row) => String(row.total_quantity_available ?? 0),
          },
          {
            key: 'is_active',
            header: 'Status',
            render: (row) => (
              <StatusBadge status={row.is_active ? 'ACTIVE' : 'INACTIVE'} />
            ),
          },
        ]}
      />

      <AdminDetailModal
        title="Product Details"
        open={Boolean(selectedProduct)}
        onClose={() => {
          setSelectedProduct(null);
          setConfirmAction(null);
        }}
        actions={
          selectedProduct ? (
            <>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              {selectedProduct.is_active ? (
                <button
                  type="button"
                  onClick={() => setConfirmAction('deactivate')}
                  className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50"
                >
                  Deactivate
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setConfirmAction('delete')}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Remove
              </button>
            </>
          ) : undefined
        }
      >
        {selectedProduct && (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">Name</dt>
              <dd className="font-medium text-gray-900">{selectedProduct.name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Generic name</dt>
              <dd className="font-medium text-gray-900">
                {selectedProduct.generic_name || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Supplier</dt>
              <dd className="font-medium text-gray-900">
                {selectedProduct.supplier?.organisation_name ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Category</dt>
              <dd className="font-medium text-gray-900">
                {selectedProduct.category?.name ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Price</dt>
              <dd className="font-medium text-gray-900">
                {formatTZS(selectedProduct.price, selectedProduct.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Stock available</dt>
              <dd className="font-medium text-gray-900">
                {selectedProduct.total_quantity_available ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Status</dt>
              <dd>
                <StatusBadge status={selectedProduct.is_active ? 'ACTIVE' : 'INACTIVE'} />
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">GTIN</dt>
              <dd className="font-medium text-gray-900">{selectedProduct.gtin || '—'}</dd>
            </div>
            {selectedProduct.description ? (
              <div className="sm:col-span-2">
                <dt className="text-gray-500">Description</dt>
                <dd className="font-medium text-gray-900">{selectedProduct.description}</dd>
              </div>
            ) : null}
            {(selectedProduct.batches?.length ?? 0) > 0 ? (
              <div className="sm:col-span-2">
                <dt className="mb-2 text-gray-500">Batches</dt>
                <dd>
                  <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Batch</th>
                          <th className="px-3 py-2 font-medium">Available</th>
                          <th className="px-3 py-2 font-medium">Expiry</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedProduct.batches?.map((batch) => (
                          <tr key={batch.id} className="border-t border-gray-100">
                            <td className="px-3 py-2">{batch.batch_number}</td>
                            <td className="px-3 py-2">{batch.available_quantity}</td>
                            <td className="px-3 py-2">{batch.expiry_date}</td>
                            <td className="px-3 py-2">
                              <StatusBadge status={batch.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </dd>
              </div>
            ) : null}
          </dl>
        )}
      </AdminDetailModal>

      <ConfirmActionModal
        open={confirmAction === 'deactivate'}
        title="Deactivate product"
        message={`Deactivate ${selectedProduct?.name}? It will be hidden from the marketplace.`}
        confirmLabel="Deactivate"
        confirmTone="danger"
        isLoading={deactivateMutation.isPending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!selectedProduct) return;
          deactivateMutation.mutate(selectedProduct.id);
        }}
      />

      <ConfirmActionModal
        open={confirmAction === 'delete'}
        title="Remove product"
        message={`Permanently remove ${selectedProduct?.name}? This cannot be undone.`}
        confirmLabel="Remove"
        confirmTone="danger"
        isLoading={deleteMutation.isPending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!selectedProduct) return;
          deleteMutation.mutate(selectedProduct.id);
        }}
      />
    </div>
  );
};

export default AdminProductsPage;
