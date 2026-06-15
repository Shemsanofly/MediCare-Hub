import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { paymentsApi, type SimulationResponse } from '@/api/paymentsApi';
import { extractErrorMessage } from '@/api/axiosConfig';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';
import { PaymentMethodSelector } from './PaymentMethodSelector';

interface PaymentSimulationProps {
  orderId: string;
  amount: string;
  currency: string;
  onPaymentComplete?: () => void;
}

const MNO_METHODS = ['mpesa', 'airtel', 'mixx', 'halopesa', 'selcom'];

const formatTZS = (amount: string, currency: string) =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));

type Stage = 'select' | 'processing' | 'done';

export function PaymentSimulation({ orderId, amount, currency, onPaymentComplete }: PaymentSimulationProps) {
  const queryClient = useQueryClient();
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState<Stage>('select');
  const [simulation, setSimulation] = useState<SimulationResponse['simulation'] | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const isMno = selectedMethod != null && MNO_METHODS.includes(selectedMethod);
  const needsPhone = isMno && phone.trim().length < 9;

  const initiateMutation = useMutation({
    mutationFn: () =>
      paymentsApi.initiateSimulation({
        order_id: orderId,
        payment_method: selectedMethod as never,
        phone,
      }),
    onSuccess: (response) => {
      setSimulation(response.data.simulation);
      setPaymentId(response.data.payment.id);
      setStage('processing');
    },
    onError: (error: AxiosError<ApiErrorResponse>) => {
      toast.error(extractErrorMessage(error) || 'Failed to initiate payment.');
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => paymentsApi.completeSimulation(id),
    onSuccess: () => {
      setStage('done');
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['hospitalDashboard'] });
      toast.success('Payment completed successfully.');
      // Give the success state a beat before the parent refetches and swaps it out.
      window.setTimeout(() => onPaymentComplete?.(), 1200);
    },
    onError: (error: AxiosError<ApiErrorResponse>) => {
      toast.error(extractErrorMessage(error) || 'Payment failed. Please try again.');
      setStage('select');
    },
  });

  // Stripe hosted Checkout — redirect to Stripe, return handled on the order page.
  const stripeMutation = useMutation({
    mutationFn: () => paymentsApi.createStripeCheckout(orderId),
    onSuccess: (response) => {
      window.location.href = response.data.url;
    },
    onError: (error: AxiosError<ApiErrorResponse>) => {
      toast.error(extractErrorMessage(error) || 'Could not start card payment.');
    },
  });

  // Simulate the MNO push: after the request is sent, auto-confirm after a short delay.
  useEffect(() => {
    if (stage !== 'processing' || !paymentId) return;
    const timer = window.setTimeout(() => completeMutation.mutate(paymentId), 2600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, paymentId]);

  if (stage === 'processing') {
    return (
      <div className="rounded-xl border border-primary-100 bg-primary-50 p-6 text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
        <h3 className="font-semibold text-gray-900">
          Processing {simulation?.method_name ?? 'payment'}…
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          {isMno && simulation?.phone
            ? `A payment request for ${formatTZS(amount, currency)} was sent to ${simulation.phone}. Approve it on your phone to continue.`
            : `Completing your ${formatTZS(amount, currency)} payment…`}
        </p>
        {simulation?.instructions?.length ? (
          <ul className="mx-auto mt-4 max-w-md list-inside list-disc space-y-1 text-left text-xs text-gray-500">
            {simulation.instructions.map((line, idx) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (stage === 'done') {
    return (
      <div className="rounded-xl border border-green-100 bg-green-50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl">
          ✅
        </div>
        <h3 className="font-semibold text-gray-900">Payment completed</h3>
        <p className="mt-1 text-sm text-gray-600">
          {formatTZS(amount, currency)} paid via {simulation?.method_name ?? 'mobile money'}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div>
        <h3 className="font-semibold text-gray-900">Pay with</h3>
        <p className="text-sm text-gray-500">Choose a payment method to complete your order.</p>
      </div>

      <PaymentMethodSelector
        selected={selectedMethod}
        onSelect={setSelectedMethod}
        disabled={initiateMutation.isPending}
      />

      {isMno && (
        <div>
          <label htmlFor="phone" className="mb-1 block text-sm font-medium text-gray-700">
            Phone number
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+255 7XX XXX XXX"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <p className="mt-1 text-xs text-gray-400">
            You&apos;ll receive a push request on this number to approve the payment.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <span className="text-sm text-gray-500">Total to pay</span>
        <span className="text-lg font-bold text-primary">{formatTZS(amount, currency)}</span>
      </div>

      <button
        type="button"
        onClick={() => initiateMutation.mutate()}
        disabled={!selectedMethod || needsPhone || initiateMutation.isPending}
        className="w-full rounded-lg bg-primary py-2.5 font-semibold text-white hover:bg-primary-600 disabled:opacity-60"
      >
        {initiateMutation.isPending
          ? 'Sending request…'
          : needsPhone
            ? 'Enter phone number to continue'
            : `Pay ${formatTZS(amount, currency)}`}
      </button>

      <div className="flex items-center gap-3 py-1 text-xs text-gray-400">
        <span className="h-px flex-1 bg-gray-200" />
        or
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      <button
        type="button"
        onClick={() => stripeMutation.mutate()}
        disabled={stripeMutation.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#635BFF] bg-white py-2.5 font-semibold text-[#635BFF] hover:bg-[#635BFF]/5 disabled:opacity-60"
      >
        {stripeMutation.isPending ? 'Redirecting to Stripe…' : '💳 Pay by card (Stripe)'}
      </button>
    </div>
  );
}
