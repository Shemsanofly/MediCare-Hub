import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { ordersApi } from '@/api';
import { Skeleton } from '@/components/ui/Skeleton';

const formatTZS = (amount: string | number, currency = 'TZS') =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));

/** Server-backed shopping cart for hospital users. */
const Cart = () => {
  const queryClient = useQueryClient();

  const cartQuery = useQuery({
    queryKey: ['cart'],
    queryFn: async () => {
      const { data } = await ordersApi.getCart();
      return data;
    },
  });

  const removeMutation = useMutation({
    mutationFn: (productId: string) => ordersApi.removeFromCart(productId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Item removed from cart.');
    },
  });

  const cart = cartQuery.data;
  const items = cart?.items ?? [];

  if (cartQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Shopping Cart</h1>
        <p className="mt-1 text-gray-600">
          Review items before checkout. All items must be from the same supplier.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <p className="text-gray-500">Your cart is empty.</p>
          <Link
            to="/marketplace"
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
          >
            Browse catalog
          </Link>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Qty</th>
                  <th className="px-4 py-3 font-medium">Subtotal</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.product_id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium">{item.product_name}</td>
                    <td className="px-4 py-3">{item.supplier_name}</td>
                    <td className="px-4 py-3">{item.quantity}</td>
                    <td className="px-4 py-3">
                      {formatTZS(item.subtotal, item.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => removeMutation.mutate(item.product_id)}
                        disabled={removeMutation.isPending}
                        className="text-sm font-medium text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div>
              <p className="text-sm text-gray-500">Cart subtotal</p>
              <p className="text-xl font-bold text-gray-900">
                {formatTZS(cart?.subtotal ?? 0, cart?.currency)}
              </p>
            </div>
            <Link
              to="/hospital/checkout"
              className="rounded-lg bg-primary px-6 py-2.5 font-semibold text-white hover:bg-primary-600"
            >
              Proceed to checkout
            </Link>
          </div>
        </>
      )}
    </div>
  );
};

export default Cart;
