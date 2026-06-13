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

/** Payment API endpoints (development mode only). */
export const paymentsApi = {
  listPayments: () =>
    apiClient.get<{ results: PaymentRecord[] }>('/payments/payments/'),

  getPayment: (paymentId: string) =>
    apiClient.get<PaymentRecord>(`/payments/payments/${paymentId}/`),

  initiatePayment: (payload: {
    order_id: string;
    payment_method: 'mpesa' | 'selcom' | 'airtel';
    phone: string;
  }) => apiClient.post<PaymentRecord>('/payments/payments/initiate/', payload),
};
