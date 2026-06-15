import { apiClient } from './axiosConfig';

export interface PaymentRecord {
  id: string;
  order_id: string;
  gateway: string;
  amount: string;
  currency: string;
  transaction_reference: string;
  gateway_reference: string;
  status: string;
  initiated_at: string;
  completed_at: string | null;
}

export interface PaymentMethod {
  id: string;
  name: string;
  color: string;
  prefix: string;
  network: string;
}

export interface SimulationResponse {
  payment: PaymentRecord;
  simulation: {
    method_id: string;
    method_name: string;
    network: string;
    phone: string;
    instructions: string[];
    simulated: boolean;
    can_complete: boolean;
  };
}

export interface SimulationStatus {
  payment: PaymentRecord;
  order_status: string;
}

/** Payment API endpoints. */
export const paymentsApi = {
  listPayments: () =>
    apiClient.get<{ results: PaymentRecord[] }>('/payments/payments/'),

  getPayment: (paymentId: string) =>
    apiClient.get<PaymentRecord>(`/payments/payments/${paymentId}/`),

  initiatePayment: (payload: {
    order_id: string;
    payment_method: 'mpesa' | 'airtel' | 'mixx' | 'halopesa' | 'selcom' | 'card' | 'bank_transfer';
    phone: string;
  }) => apiClient.post<PaymentRecord>('/payments/payments/initiate/', payload),

  /** Simulation-only endpoints for local/demo testing. */
  getPaymentMethods: () =>
    apiClient.get<{ results: PaymentMethod[] }>('/payments/simulate/methods/'),

  initiateSimulation: (payload: {
    order_id: string;
    payment_method: 'mpesa' | 'airtel' | 'mixx' | 'halopesa' | 'selcom' | 'card' | 'bank_transfer';
    phone: string;
  }) => apiClient.post<SimulationResponse>('/payments/simulate/initiate/', payload),

  completeSimulation: (paymentId: string) =>
    apiClient.post<{ payment: PaymentRecord; already_completed?: boolean; order_status?: string }>(
      `/payments/simulate/${paymentId}/complete/`,
    ),

  getSimulationStatus: (paymentId: string) =>
    apiClient.get<SimulationStatus>(`/payments/simulate/${paymentId}/status/`),

  /** Stripe card payment (hosted Checkout). */
  stripeConfig: () => apiClient.get<{ enabled: boolean }>('/payments/stripe/config/'),

  createStripeCheckout: (orderId: string) =>
    apiClient.post<{ url: string; session_id: string; publishable_key: string }>(
      '/payments/stripe/checkout/',
      { order_id: orderId },
    ),

  confirmStripe: (sessionId: string) =>
    apiClient.post<{ paid: boolean; order_status: string; payment_status: string }>(
      '/payments/stripe/confirm/',
      { session_id: sessionId },
    ),
};
