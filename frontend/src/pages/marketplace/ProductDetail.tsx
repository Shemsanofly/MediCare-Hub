import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';

import { useQueryClient } from '@tanstack/react-query';

import { marketplaceApi, ordersApi } from '@/api';
import ProductCard from '@/components/marketplace/ProductCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import { ProductCardSkeleton, Skeleton } from '@/components/ui/Skeleton';
import type { Product } from '@/types';

const LARGE_ORDER_THRESHOLD = 100;

const formatPrice = (price: string | number, currency: string) =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency: currency || 'TZS',
    maximumFractionDigits: 0,
  }).format(Number(price));

/** Full product detail page with batches, supplier info, and price history. */
const ProductDetail = () => {
  const { productId } = useParams<{ productId: string }>();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(1);

  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const { data } = await marketplaceApi.getProduct(productId!);
      return data;
    },
    enabled: Boolean(productId),
  });

  const priceHistoryQuery = useQuery({
    queryKey: ['priceHistory', productId],
    queryFn: async () => {
      const { data } = await marketplaceApi.getPriceHistory(productId!);
      return data.results ?? [];
    },
    enabled: Boolean(productId),
  });

  const alternativesQuery = useQuery({
    queryKey: ['alternatives', productId],
    queryFn: async () => {
      const { data } = await marketplaceApi.getGenericAlternatives(productId!);
      return data.results ?? [];
    },
    enabled: Boolean(productId),
  });

  const product = productQuery.data;
  const maxStock = product?.total_quantity_available ?? 0;
  const isLargeOrder =
    (product?.minimum_order_quantity ?? 0) >= LARGE_ORDER_THRESHOLD;

  const handleAddToCart = async () => {
    if (!product) return;

    if (quantity > maxStock) {
      toast.error(`Only ${maxStock} units available.`);
      return;
    }

    try {
      await ordersApi.addToCart(product.id, quantity);
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success(`${product.name} added to cart.`);
    } catch {
      // Error toast handled by axios interceptor.
    }
  };

  if (productQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-12 text-center">
        <p className="text-gray-500">Product not found.</p>
        <Link to="/marketplace" className="mt-4 inline-block text-primary hover:underline">
          Back to catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link to="/marketplace" className="text-sm text-primary hover:underline">
          ← Back to catalog
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{product.name}</h1>
        {product.generic_name && (
          <p className="text-gray-500">{product.generic_name}</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Product information</h2>
            <p className="mb-4 text-sm text-gray-600">{product.description}</p>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">GTIN</dt>
                <dd className="font-medium">{product.gtin || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Unit</dt>
                <dd className="font-medium">{product.unit_of_measure}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Category</dt>
                <dd className="font-medium">{product.category.name}</dd>
              </div>
              {product.tmda_registration_number && (
                <div>
                  <dt className="text-gray-500">TMDA registration</dt>
                  <dd className="font-medium text-secondary">
                    {product.tmda_registration_number} ✓
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Available stock summary</h2>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <StatusBadge status={product.inventory_status ?? (maxStock > 0 ? 'ACTIVE' : 'OUT_OF_STOCK')} />
              <span className="text-sm text-gray-600">
                {maxStock} units available for procurement
              </span>
            </div>
            {product.batches.length === 0 ? (
              <p className="text-sm text-gray-500">No batch information available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="pb-2 font-medium">Batch #</th>
                      <th className="pb-2 font-medium">Expiry</th>
                      <th className="pb-2 font-medium">Available</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.batches.map((batch) => (
                      <tr key={batch.id} className="border-t border-gray-100">
                        <td className="py-2">{batch.batch_number}</td>
                        <td className="py-2">{batch.expiry_date}</td>
                        <td className="py-2">{batch.available_quantity}</td>
                        <td className="py-2">
                          <StatusBadge status={batch.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Price history (6 months)</h2>
            {priceHistoryQuery.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (priceHistoryQuery.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-gray-500">No price history available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={priceHistoryQuery.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) =>
                      formatPrice(Number(value ?? 0), product.currency)
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#1B4F8C"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </section>

          {(alternativesQuery.data?.length ?? 0) > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-semibold">Generic alternatives</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {alternativesQuery.isLoading
                  ? Array.from({ length: 2 }).map((_, index) => (
                      <ProductCardSkeleton key={index} />
                    ))
                  : alternativesQuery.data!.map((alt: Product) => (
                      <ProductCard
                        key={alt.id}
                        product={alt}
                        onAddToCart={async (p, qty) => {
                          try {
                            await ordersApi.addToCart(p.id, qty);
                            void queryClient.invalidateQueries({ queryKey: ['cart'] });
                            toast.success(`${p.name} added to cart.`);
                          } catch {
                            // Error toast handled by axios interceptor.
                          }
                        }}
                        onRequestQuote={() =>
                          toast.info(`Quote request initiated for ${alt.name}.`)
                        }
                      />
                    ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-2xl font-bold text-gray-900">
              {formatPrice(product.price, product.currency)}
              <span className="text-base font-normal text-gray-500">
                / {product.unit_of_measure}
              </span>
            </p>
            <p
              className={`mt-2 text-sm ${
                maxStock > 0 ? 'text-secondary' : 'text-red-600'
              }`}
            >
              {maxStock > 0 ? `${maxStock} in stock` : 'Out of stock'}
            </p>

            <div className="mt-4">
              <label htmlFor="quantity" className="mb-1 block text-sm font-medium text-gray-700">
                Quantity
              </label>
              <input
                id="quantity"
                type="number"
                min={product.minimum_order_quantity || 1}
                max={maxStock}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {quantity > maxStock && (
                <p className="mt-1 text-sm text-red-600">
                  Exceeds available stock ({maxStock})
                </p>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {isLargeOrder ? (
                <button
                  type="button"
                  onClick={() => toast.info(`Quote request initiated for ${product.name}.`)}
                  className="w-full rounded-lg border border-primary py-2.5 font-semibold text-primary hover:bg-primary-50"
                >
                  Request Quote
                </button>
              ) : (
                <button
                  type="button"
                  disabled={maxStock === 0 || quantity > maxStock}
                  onClick={handleAddToCart}
                  className="w-full rounded-lg bg-primary py-2.5 font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add to Cart
                </button>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Supplier</h2>
            <p className="font-medium text-gray-900">
              {product.supplier.organisation_name}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-sm font-medium text-primary">
                Trust score: {product.supplier.trust_score}
              </span>
              <span className="text-sm text-gray-500">
                ★ {product.supplier.supplier_rating}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Avg. delivery: {product.supplier.average_delivery_days} days
            </p>
            <p className="mt-1 text-xs capitalize text-gray-500">
              Status: {product.supplier.verification_status.toLowerCase()}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
