import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { marketplaceApi, ordersApi } from '@/api';
import { Skeleton } from '@/components/ui/Skeleton';
import type { SupplierOffer } from '@/types';

interface SupplierComparisonProps {
  productId: string;
}

const formatPrice = (price: string | number, currency: string) =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency: currency || 'TZS',
    maximumFractionDigits: 0,
  }).format(Number(price));

const Badge = ({ children, tone }: { children: string; tone: 'green' | 'amber' | 'blue' }) => {
  const tones = {
    green: 'bg-secondary-50 text-secondary-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-primary-50 text-primary-700',
  } as const;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
};

/**
 * Lets a buyer compare every supplier that offers the same product, by price
 * and rating, and add any supplier's offer to the cart. Renders nothing when
 * the product is only available from a single supplier.
 */
export function SupplierComparison({ productId }: SupplierComparisonProps) {
  const queryClient = useQueryClient();

  const offersQuery = useQuery({
    queryKey: ['productOffers', productId],
    queryFn: async () => {
      const { data } = await marketplaceApi.getProductOffers(productId);
      return data;
    },
    enabled: Boolean(productId),
  });

  if (offersQuery.isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  const data = offersQuery.data;
  if (!data || data.offer_count < 2) {
    return null;
  }

  const handleAddToCart = async (offer: SupplierOffer) => {
    if (!offer.in_stock) return;
    const qty = offer.minimum_order_quantity || 1;
    try {
      await ordersApi.addToCart(offer.product_id, qty);
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success(
        `Added ${qty} × ${data.product.name} from ${offer.supplier.organisation_name} to cart.`,
      );
    } catch {
      // Error toast handled by axios interceptor.
    }
  };

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Compare suppliers</h2>
        <span className="text-sm text-gray-500">{data.offer_count} suppliers</span>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        The same product is offered by multiple suppliers. Compare price and rating, then buy from
        whichever you prefer.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-gray-500">
            <tr>
              <th className="pb-2 font-medium">Supplier</th>
              <th className="pb-2 font-medium">Rating</th>
              <th className="pb-2 font-medium">Avg. delivery</th>
              <th className="pb-2 font-medium">Price</th>
              <th className="pb-2 font-medium">Availability</th>
              <th className="pb-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {data.offers.map((offer) => (
              <tr
                key={offer.product_id}
                className={`border-t border-gray-100 ${
                  offer.is_current ? 'bg-primary-50/40' : ''
                }`}
              >
                <td className="py-3 pr-3">
                  <div className="font-medium text-gray-900">
                    {offer.supplier.organisation_name}
                  </div>
                  {offer.is_current && (
                    <span className="text-xs text-primary">Currently viewing</span>
                  )}
                </td>
                <td className="py-3 pr-3">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-medium text-gray-900">
                      ★ {offer.supplier.trust_score}
                      <span className="font-normal text-gray-400">/100</span>
                    </span>
                    {offer.is_highest_rated && <Badge tone="green">Top rated</Badge>}
                  </div>
                </td>
                <td className="py-3 pr-3 text-gray-700">
                  <div className="flex flex-wrap items-center gap-1">
                    <span>{offer.supplier.average_delivery_days} days</span>
                    {offer.is_fastest_delivery && <Badge tone="blue">Fastest</Badge>}
                  </div>
                </td>
                <td className="py-3 pr-3">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-semibold text-gray-900">
                      {formatPrice(offer.price, offer.currency)}
                    </span>
                    {offer.is_lowest_price && <Badge tone="green">Lowest price</Badge>}
                  </div>
                </td>
                <td className="py-3 pr-3">
                  {offer.in_stock ? (
                    <span className="text-secondary-700">
                      {offer.total_quantity_available} in stock
                    </span>
                  ) : (
                    <span className="text-red-600">Out of stock</span>
                  )}
                </td>
                <td className="py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {!offer.is_current && (
                      <Link
                        to={`/marketplace/products/${offer.product_id}`}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        View
                      </Link>
                    )}
                    <button
                      type="button"
                      disabled={!offer.in_stock}
                      onClick={() => handleAddToCart(offer)}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Add to cart
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default SupplierComparison;
