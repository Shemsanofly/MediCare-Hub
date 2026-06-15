import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ordersApi, paymentsApi } from '@/api';
import { extractErrorMessage } from '@/api/axiosConfig';
import ConfirmActionModal from '@/components/admin/ConfirmActionModal';
import StatusBadge from '@/components/dashboard/StatusBadge';
import OrderTimeline from '@/components/orders/OrderTimeline';
import StatusProgressTracker from '@/components/orders/StatusProgressTracker';
import { PaymentSimulation } from '@/components/payments/PaymentSimulation';
import { Skeleton } from '@/components/ui/Skeleton';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';
import { useEffect, useRef, useState } from 'react';

const formatTZS = (amount: string | number, currency = 'TZS') =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));

/** Plain-language explanation of the current stage and who acts next. */
const nextStepHint = (
  status: string,
  supplier: string,
  isPaid: boolean,
): { text: string; tone: 'info' | 'success' | 'warn' } => {
  switch (status) {
    case 'PENDING':
      return isPaid
        ? {
            text: `Payment received. Your order has been sent to ${supplier} and will move forward once they accept it.`,
            tone: 'success',
          }
        : {
            text: `Complete payment below to confirm your order with ${supplier}.`,
            tone: 'info',
          };
    case 'ACCEPTED':
      return { text: `${supplier} accepted your order and is getting it ready for shipment.`, tone: 'info' };
    case 'APPROVED':
      return { text: 'Approved internally — awaiting confirmation from the supplier.', tone: 'info' };
    case 'CONFIRMED':
      return { text: `Confirmed by ${supplier}.`, tone: 'info' };
    case 'PAID':
      return { text: `Payment received — awaiting fulfilment by ${supplier}.`, tone: 'success' };
    case 'PREPARING':
      return { text: `${supplier} is preparing your order for shipment.`, tone: 'info' };
    case 'PROCESSING':
      return { text: `${supplier} is processing your order.`, tone: 'info' };
    case 'SHIPPED':
      return { text: 'Your order has shipped and is on its way.', tone: 'info' };
    case 'DELIVERED':
      return { text: 'Delivered — confirm receipt below to complete the order.', tone: 'info' };
    case 'COMPLETED':
      return { text: 'Order completed. Thank you!', tone: 'success' };
    case 'REJECTED':
      return { text: 'This order was rejected by the supplier.', tone: 'warn' };
    case 'CANCELLED':
      return { text: 'This order was cancelled.', tone: 'warn' };
    case 'DISPUTED':
      return { text: 'This order is under dispute.', tone: 'warn' };
    default:
      return { text: '', tone: 'info' };
  }
};

/** Order detail page backed by the orders API. */
const OrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [confirmComplete, setConfirmComplete] = useState(false);
  const stripeHandled = useRef(false);

  const orderQuery = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const { data } = await ordersApi.getOrder(orderId!);
      return data;
    },
    enabled: Boolean(orderId),
  });

  // Handle the return from Stripe Checkout (success_url / cancel_url).
  useEffect(() => {
    if (stripeHandled.current) return;
    const stripe = searchParams.get('stripe');
    if (!stripe) return;
    stripeHandled.current = true;
    const sessionId = searchParams.get('session_id');

    if (stripe === 'success' && sessionId) {
      paymentsApi
        .confirmStripe(sessionId)
        .then(({ data }) => {
          if (data.paid) {
            toast.success('Card payment received. Thank you!');
          } else {
            toast.info('Payment is still processing. Refresh in a moment.');
          }
          void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
        })
        .catch(() => toast.error('Could not confirm the card payment.'));
    } else if (stripe === 'cancel') {
      toast.info('Card payment cancelled.');
    }

    // Strip the query params so a refresh doesn't re-trigger.
    const next = new URLSearchParams(searchParams);
    next.delete('stripe');
    next.delete('session_id');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, orderId, queryClient]);

  const completeMutation = useMutation({
    mutationFn: () => ordersApi.completeOrder(orderId!),
    onSuccess: () => {
      toast.success('Delivery confirmed. Order completed.');
      setConfirmComplete(false);
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['hospitalDashboard'] });
    },
    onError: (error: AxiosError<ApiErrorResponse>) => {
      toast.error(extractErrorMessage(error));
    },
  });

  const order = orderQuery.data;

  if (orderQuery.isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  if (!order) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-12 text-center">
        <p className="text-gray-500">Order not found.</p>
        <Link to="/hospital/dashboard" className="mt-4 inline-block text-primary hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/hospital/orders" className="text-sm text-primary hover:underline">
          ← Back to my orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Order details</h1>
          <StatusBadge status={order.status} />
        </div>
        <p className="text-sm text-gray-500">
          {order.id.slice(0, 8).toUpperCase()} · {order.supplier_name}
        </p>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Order progress</h2>
        <StatusProgressTracker status={order.status} />
        {(() => {
          const hint = nextStepHint(
            order.status,
            order.supplier_name,
            order.payment_status === 'COMPLETED',
          );
          if (!hint.text) return null;
          const tones = {
            info: 'border-primary-100 bg-primary-50 text-primary-800',
            success: 'border-green-100 bg-green-50 text-green-800',
            warn: 'border-amber-100 bg-amber-50 text-amber-800',
          } as const;
          return (
            <p className={`mt-4 rounded-lg border px-4 py-2.5 text-sm ${tones[hint.tone]}`}>
              {hint.text}
            </p>
          );
        })()}
      </section>

      {['PENDING', 'ACCEPTED', 'CONFIRMED', 'APPROVED'].includes(order.status) &&
        order.payment_status !== 'COMPLETED' && (
          <PaymentSimulation
            orderId={order.id}
            amount={order.total_amount}
            currency={order.currency}
            onPaymentComplete={() => {
              void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
            }}
          />
        )}

      {order.payment_status === 'COMPLETED' && order.status !== 'COMPLETED' && (
        <section className="rounded-xl border border-green-100 bg-green-50 p-5">
          <div className="flex items-center gap-2">
            <span className="text-lg">✅</span>
            <div>
              <h2 className="font-semibold text-gray-900">Payment successful</h2>
              <p className="text-sm text-gray-600">
                {formatTZS(order.payment_amount ?? order.total_amount, order.currency)} paid — your
                order is now awaiting fulfilment by {order.supplier_name}.
              </p>
            </div>
          </div>
        </section>
      )}

      {order.status === 'DELIVERED' && (
        <section className="rounded-xl border border-secondary-100 bg-secondary-50 p-5">
          <h2 className="font-semibold text-gray-900">Confirm delivery</h2>
          <p className="mt-1 text-sm text-gray-600">
            The supplier marked this order as delivered. Confirm receipt to complete the order.
          </p>
          <button
            type="button"
            onClick={() => setConfirmComplete(true)}
            className="mt-4 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white hover:bg-secondary-600"
          >
            Confirm Delivery
          </button>
        </section>
      )}

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Supplier</dt>
            <dd className="font-medium">{order.supplier_name}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Payment terms</dt>
            <dd className="font-medium">{order.payment_terms}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Total</dt>
            <dd className="font-medium">
              {formatTZS(order.total_amount, order.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Created</dt>
            <dd className="font-medium">
              {new Date(order.created_at).toLocaleString()}
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Line items</h2>
          <ul className="divide-y divide-gray-100">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between py-2 text-sm">
                <span>
                  {item.product_name} × {item.quantity_ordered}
                </span>
                <span>{formatTZS(item.subtotal, order.currency)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Status history</h2>
          <OrderTimeline
            history={order.status_history ?? []}
            orderCreatedAt={order.created_at}
            currentStatus={order.status}
          />
        </section>
      </div>

      <ConfirmActionModal
        open={confirmComplete}
        title="Confirm delivery"
        message="Confirm that you have received this order in good condition?"
        confirmLabel="Confirm delivery"
        confirmTone="primary"
        isLoading={completeMutation.isPending}
        onCancel={() => setConfirmComplete(false)}
        onConfirm={() => completeMutation.mutate()}
      />
    </div>
  );
};

export default OrderDetail;
