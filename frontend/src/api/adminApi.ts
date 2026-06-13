import { apiClient } from './axiosConfig';
import type { Product, User } from '@/types';
import type { BackendOrder } from './ordersApi';

export interface AdminSupplier {
  id: string;
  organisation_name: string;
  brela_registration_number: string;
  tmda_license_number: string;
  license_expiry_date: string | null;
  verification_status: string;
  rejection_reason?: string;
  created_at: string;
  has_required_documents?: boolean;
}

export interface AdminOrder extends BackendOrder {
  hospital_name: string;
  payment_status: string;
  payment_amount: string | null;
}

export const adminApi = {
  listUsers: (params?: { search?: string; role?: string; is_active?: string }) =>
    apiClient.get<{ results: User[] }>('/admin/users/', { params }),

  getUser: (userId: string) =>
    apiClient.get<User>(`/admin/users/${userId}/`),

  updateUser: (userId: string, payload: { is_active?: boolean }) =>
    apiClient.patch<User>(`/admin/users/${userId}/`, payload),

  listSuppliers: (params?: { search?: string; status?: string }) =>
    apiClient.get<{ results: AdminSupplier[] }>('/admin/suppliers/', { params }),

  getSupplier: (supplierId: string) =>
    apiClient.get<AdminSupplier>(`/admin/suppliers/${supplierId}/`),

  verifySupplier: (supplierId: string) =>
    apiClient.post<AdminSupplier>(`/admin/suppliers/${supplierId}/verify/`),

  rejectSupplier: (supplierId: string, reason: string) =>
    apiClient.patch<AdminSupplier>(`/admin/suppliers/${supplierId}/reject/`, {
      reason,
    }),

  listProducts: (params?: {
    search?: string;
    category?: string;
    supplier?: string;
    stock_status?: string;
    is_active?: string;
  }) => apiClient.get<{ results: Product[] }>('/admin/products/', { params }),

  getProduct: (productId: string) =>
    apiClient.get<Product>(`/admin/products/${productId}/`),

  updateProduct: (productId: string, payload: { is_active?: boolean }) =>
    apiClient.patch<Product>(`/admin/products/${productId}/`, payload),

  deleteProduct: (productId: string) =>
    apiClient.delete(`/admin/products/${productId}/`),

  listOrders: (params?: { status?: string; search?: string }) =>
    apiClient.get<{ results: AdminOrder[] }>('/admin/orders/', { params }),

  getOrder: (orderId: string) =>
    apiClient.get<AdminOrder>(`/admin/orders/${orderId}/`),
};
