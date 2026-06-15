import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { marketplaceApi } from '@/api';
import ErrorMessage from '@/components/dashboard/ErrorMessage';
import LoadingSpinner from '@/components/dashboard/LoadingSpinner';
import { ProductImageManager } from '@/components/products/ProductImageManager';
import { extractErrorMessage } from '@/api/axiosConfig';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';

const SupplierProductFormPage = () => {
  const { productId } = useParams<{ productId: string }>();
  const isEdit = Boolean(productId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await marketplaceApi.getCategories();
      return data.results ?? [];
    },
  });

  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const { data } = await marketplaceApi.getProduct(productId!);
      return data;
    },
    enabled: isEdit,
  });

  const [form, setForm] = useState({
    name: '',
    generic_name: '',
    category_id: '',
    unit_of_measure: 'tablet',
    price: '',
    description: '',
    minimum_order_quantity: '1',
  });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // Opening stock for a brand-new product, so buyers can order it immediately
  // instead of seeing it as out of stock. Existing products manage stock via
  // their inventory/batches page.
  const defaultExpiry = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const [openingStock, setOpeningStock] = useState('');
  const [stockExpiry, setStockExpiry] = useState(defaultExpiry);

  useEffect(() => {
    if (!productQuery.data || !isEdit) {
      return;
    }
    setForm({
      name: productQuery.data.name,
      generic_name: productQuery.data.generic_name ?? '',
      category_id: productQuery.data.category?.id ?? '',
      unit_of_measure: productQuery.data.unit_of_measure,
      price: productQuery.data.price,
      description: productQuery.data.description ?? '',
      minimum_order_quantity: String(productQuery.data.minimum_order_quantity ?? 1),
    });
  }, [productQuery.data, isEdit]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        generic_name: form.generic_name,
        category_id: form.category_id,
        unit_of_measure: form.unit_of_measure,
        price: form.price,
        description: form.description,
        minimum_order_quantity: Number(form.minimum_order_quantity),
      };
      if (isEdit) {
        return marketplaceApi.updateProduct(productId!, payload);
      }
      return marketplaceApi.createProduct(payload);
    },
    onSuccess: async (response) => {
      const savedProductId = response.data.id;
      // In edit mode images are managed live; on create, upload the files the
      // supplier selected before the product existed.
      if (!isEdit && pendingFiles.length > 0 && savedProductId) {
        try {
          await marketplaceApi.uploadImages(savedProductId, pendingFiles);
          toast.success(
            pendingFiles.length > 1 ? `${pendingFiles.length} images uploaded.` : 'Image uploaded.',
          );
        } catch (imageError) {
          toast.error('Product saved, but image upload failed.');
        }
      }
      // Create an opening inventory batch so the new product is in stock and
      // orderable right away.
      if (!isEdit && Number(openingStock) > 0 && savedProductId) {
        try {
          await marketplaceApi.createBatch(savedProductId, {
            batch_number: `OPEN-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
            expiry_date: stockExpiry,
            quantity: Number(openingStock),
          });
        } catch (stockError) {
          toast.error('Product saved, but opening stock could not be added.');
        }
      }
      toast.success(isEdit ? 'Product updated.' : 'Product created.');
      void queryClient.invalidateQueries({ queryKey: ['supplierProducts'] });
      void queryClient.invalidateQueries({ queryKey: ['supplierDashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['product', savedProductId] });
      navigate('/supplier/products');
    },
    onError: (error: AxiosError<ApiErrorResponse>) => {
      toast.error(extractErrorMessage(error));
    },
  });

  if (categoriesQuery.isLoading || (isEdit && productQuery.isLoading)) {
    return <LoadingSpinner />;
  }

  if (categoriesQuery.isError || productQuery.isError) {
    const err = (categoriesQuery.error ?? productQuery.error) as AxiosError<ApiErrorResponse>;
    return <ErrorMessage message={extractErrorMessage(err)} />;
  }

  const categories = categoriesQuery.data ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/supplier/products" className="text-sm text-secondary hover:underline">
          ← Back to products
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          {isEdit ? 'Edit Product' : 'Add Product'}
        </h1>
      </div>

      <form
        className="space-y-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          saveMutation.mutate();
        }}
      >
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
            Product name *
          </label>
          <input
            id="name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
          />
        </div>

        <div>
          <label htmlFor="generic_name" className="mb-1 block text-sm font-medium text-gray-700">
            Generic name
          </label>
          <input
            id="generic_name"
            value={form.generic_name}
            onChange={(e) => setForm({ ...form, generic_name: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
          />
        </div>

        <div>
          <label htmlFor="category_id" className="mb-1 block text-sm font-medium text-gray-700">
            Category *
          </label>
          <select
            id="category_id"
            required
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
          >
            <option value="">Select category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="unit_of_measure" className="mb-1 block text-sm font-medium text-gray-700">
              Unit *
            </label>
            <input
              id="unit_of_measure"
              required
              value={form.unit_of_measure}
              onChange={(e) => setForm({ ...form, unit_of_measure: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="price" className="mb-1 block text-sm font-medium text-gray-700">
              Price (TZS) *
            </label>
            <input
              id="price"
              required
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            id="description"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>

        {!isEdit && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-700">Opening stock</p>
            <p className="mb-3 mt-0.5 text-xs text-gray-500">
              Add initial inventory so buyers can order this product right away. Leave the quantity
              at 0 to add stock later from the product&apos;s inventory page.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="opening_stock"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Quantity available
                </label>
                <input
                  id="opening_stock"
                  type="number"
                  min="0"
                  value={openingStock}
                  onChange={(e) => setOpeningStock(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label
                  htmlFor="stock_expiry"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Expiry date
                </label>
                <input
                  id="stock_expiry"
                  type="date"
                  value={stockExpiry}
                  onChange={(e) => setStockExpiry(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
            </div>
          </div>
        )}

        <ProductImageManager
          productId={isEdit ? productId! : null}
          images={productQuery.data?.images ?? []}
          pendingFiles={pendingFiles}
          onPendingFilesChange={setPendingFiles}
          onChanged={() =>
            void queryClient.invalidateQueries({ queryKey: ['product', productId] })
          }
          disabled={saveMutation.isPending}
        />

        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="w-full rounded-lg bg-secondary py-2.5 font-semibold text-white hover:bg-secondary-600 disabled:opacity-60"
        >
          {saveMutation.isPending ? 'Saving…' : isEdit ? 'Update Product' : 'Create Product'}
        </button>
      </form>
    </div>
  );
};

export default SupplierProductFormPage;
