import { apiClient } from './axiosConfig';
import type { OrderStatus } from '@/types';

export interface BackendCartItem {
  product_id: string;
  product_name: string;
  batch_id: string | null;
  batch_number: string | null;
  quantity: number;
  unit_price: string;
  subtotal: string;
  currency: string;
  supplier_id: string;
  supplier_name: string;
  stock_available: number;
  in_stock: boolean;
  is_expired: boolean;
  minimum_order_quantity: number;
}

export interface BackendCart {
  items: BackendCartItem[];
  item_count: number;
  subtotal: string;
  currency: string;
}

export interface BackendOrderItem {
  id: string;
  product_id: string;
  product_name: string;
  batch_id: string | null;
  quantity_ordered: number;
  unit_price: string;
  subtotal: string;
}

export interface OrderStatusHistoryEntry {
  id: string;
  from_status: string;
  to_status: string;
  changed_by_email: string | null;
  changed_by_role: string | null;
  reason: string;
  created_at: string;
}

export interface BackendOrder {
  id: string;
  status: OrderStatus;
  buyer_id: string;
  organisation_id: string;
  supplier_id: string;
  supplier_name: string;
  hospital_name?: string;
  subtotal: string;
  delivery_fee: string;
  tax_amount: string;
  total_amount: string;
  currency: string;
  lpo_number: string;
  payment_terms: string;
  notes: string;
  requires_approval: boolean;
  approval_steps: Array<{
    id: string;
    step_number: number;
    required_role: string;
    status: string;
    threshold_amount: string;
  }>;
  items: BackendOrderItem[];
  status_history?: OrderStatusHistoryEntry[];
  created_at: string;
}

export interface CheckoutResponse {
  order: BackendOrder;
  payment_instructions: string;
}

/** Orders, cart, and checkout API endpoints. */
export const ordersApi = {
  getCart: () => apiClient.get<BackendCart>('/orders/cart/'),

  addToCart: (productId: string, quantity: number, batchId?: string) =>
    apiClient.post<BackendCart>('/orders/cart/', {
      product_id: productId,
      quantity,
      ...(batchId ? { batch_id: batchId } : {}),
    }),

  removeFromCart: (productId: string) =>
    apiClient.delete<BackendCart>('/orders/cart/', {
      data: { product_id: productId },
    }),

  checkout: (payload: {
    notes?: string;
    payment_terms?: string;
    delivery_fee?: number;
    tax_amount?: number;
    lpo_number?: string;
  } = {}) => apiClient.post<CheckoutResponse>('/orders/checkout/', payload),

  listOrders: () =>
    apiClient.get<{ results: BackendOrder[] }>('/orders/orders/'),

  getOrder: (orderId: string) =>
    apiClient.get<BackendOrder>(`/orders/orders/${orderId}/`),

  approveOrder: (orderId: string) =>
    apiClient.post<BackendOrder>(`/orders/orders/${orderId}/approve/`),

  transitionOrder: (
    orderId: string,
    status: OrderStatus,
    reason?: string,
  ) =>
    apiClient.post<BackendOrder>(`/orders/orders/${orderId}/transition/`, {
      status,
      reason: reason ?? '',
    }),

  acceptOrder: (orderId: string) =>
    apiClient.post<BackendOrder>(`/orders/${orderId}/accept/`),

  rejectOrder: (orderId: string, reason: string) =>
    apiClient.post<BackendOrder>(`/orders/${orderId}/reject/`, { reason }),

  prepareOrder: (orderId: string) =>
    apiClient.post<BackendOrder>(`/orders/${orderId}/prepare/`),

  shipOrder: (orderId: string) =>
    apiClient.post<BackendOrder>(`/orders/${orderId}/ship/`),

  deliverOrder: (orderId: string) =>
    apiClient.post<BackendOrder>(`/orders/${orderId}/deliver/`),

  completeOrder: (orderId: string) =>
    apiClient.post<BackendOrder>(`/orders/${orderId}/complete/`),
};
