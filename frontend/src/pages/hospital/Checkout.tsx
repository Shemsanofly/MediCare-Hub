import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { ordersApi } from '@/api';
import { Skeleton } from '@/components/ui/Skeleton';

const formatTZS = (amount: string | number, currency = 'TZS') =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));

/** Checkout page — submits the server cart as a procurement order. */
const Checkout = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');

  const cartQuery = useQuery({
    queryKey: ['cart'],
    queryFn: async () => {
      const { data } = await ordersApi.getCart();
      return data;
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: () =>
      ordersApi.checkout({
        notes,
        payment_terms: 'IMMEDIATE',
      }),
    onSuccess: (response) => {
      toast.success('Order placed successfully.');
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
      void queryClient.invalidateQueries({ queryKey: ['recentOrders'] });
      navigate(`/hospital/orders/${response.data.order.id}`);
    },
  });

  const cart = cartQuery.data;

  if (cartQuery.isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  if (!cart?.items.length) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-12 text-center">
        <p className="text-gray-500">No items to checkout.</p>
        <Link to="/hospital/cart" className="mt-4 inline-block text-primary hover:underline">
          Return to cart
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Checkout</h1>
        <p className="mt-1 text-gray-600">Submit your procurement order.</p>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Order summary</h2>
        <ul className="divide-y divide-gray-100">
          {cart.items.map((item) => (
            <li key={item.product_id} className="flex justify-between py-2 text-sm">
              <span>
                {item.product_name} × {item.quantity}
              </span>
              <span>{formatTZS(item.subtotal, item.currency)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-gray-100 pt-4 font-semibold">
          <span>Total</span>
          <span>{formatTZS(cart.subtotal, cart.currency)}</span>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <label htmlFor="notes" className="mb-1 block text-sm font-medium text-gray-700">
          Order notes (optional)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="Delivery instructions or LPO reference…"
        />
      </section>

      <div className="flex gap-3">
        <Link
          to="/hospital/cart"
          className="flex-1 rounded-lg border border-gray-300 py-2.5 text-center font-semibold text-gray-700 hover:bg-gray-50"
        >
          Back to cart
        </Link>
        <button
          type="button"
          onClick={() => checkoutMutation.mutate()}
          disabled={checkoutMutation.isPending}
          className="flex-1 rounded-lg bg-primary py-2.5 font-semibold text-white hover:bg-primary-600 disabled:opacity-60"
        >
          {checkoutMutation.isPending ? 'Placing order…' : 'Place order'}
        </button>
      </div>
    </div>
  );
};

export default Checkout;
