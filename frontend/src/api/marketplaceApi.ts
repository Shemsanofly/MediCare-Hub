import { apiClient } from './axiosConfig';
import type {
  Category,
  PriceHistoryPoint,
  Product,
  ProductBatch,
  ProductFilters,
  SupplierSummary,
} from '@/types';

/** Cursor-paginated product list response from the backend. */
export interface ProductListResponse {
  next: string | null;
  page_size: number;
  results: Product[];
}

const extractCategories = (products: Product[]): Category[] => {
  const map = new Map<string, Category>();
  products.forEach((product) => {
    if (product.category && !map.has(product.category.id)) {
      map.set(product.category.id, { ...product.category, children: [] });
    }
  });
  return Array.from(map.values());
};

const extractSuppliers = (products: Product[]): SupplierSummary[] => {
  const map = new Map<string, SupplierSummary>();
  products.forEach((product) => {
    if (product.supplier && !map.has(product.supplier.id)) {
      map.set(product.supplier.id, product.supplier);
    }
  });
  return Array.from(map.values());
};

/** Marketplace catalog API endpoints. */
export const marketplaceApi = {
  getProducts: (filters: ProductFilters = {}) =>
    apiClient.get<ProductListResponse>('/marketplace/products/', {
      params: filters,
    }),

  getProduct: (productId: string) =>
    apiClient.get<Product>(`/marketplace/products/${productId}/`),

  createProduct: (payload: Record<string, unknown>) =>
    apiClient.post<Product>('/marketplace/products/', payload),

  updateProduct: (productId: string, payload: Record<string, unknown>) =>
    apiClient.patch<Product>(`/marketplace/products/${productId}/`, payload),

  deleteProduct: (productId: string) =>
    apiClient.delete(`/marketplace/products/${productId}/`),

  listBatches: (productId: string) =>
    apiClient.get<{ results: ProductBatch[] }>(
      `/marketplace/products/${productId}/batches/`,
    ),

  createBatch: (productId: string, payload: Record<string, unknown>) =>
    apiClient.post<ProductBatch>(
      `/marketplace/products/${productId}/batches/`,
      payload,
    ),

  updateBatch: (batchId: string, payload: Record<string, unknown>) =>
    apiClient.patch<ProductBatch>(`/marketplace/batches/${batchId}/`, payload),

  deleteBatch: (batchId: string) =>
    apiClient.delete(`/marketplace/batches/${batchId}/`),

  /** Derive categories from the product catalog (no dedicated backend endpoint). */
  getCategories: async () => {
    const { data } = await apiClient.get<ProductListResponse>(
      '/marketplace/products/',
      { params: { page_size: 100 } },
    );
    return { data: { results: extractCategories(data.results ?? []) } };
  },

  /** Derive suppliers from the product catalog (no dedicated backend endpoint). */
  getSuppliers: async () => {
    const { data } = await apiClient.get<ProductListResponse>(
      '/marketplace/products/',
      { params: { page_size: 100 } },
    );
    return { data: { results: extractSuppliers(data.results ?? []) } };
  },

  /** Price history not yet implemented on backend — returns empty list. */
  getPriceHistory: async (_productId: string) => ({
    data: { results: [] as PriceHistoryPoint[] },
  }),

  /** Generic alternatives not yet implemented on backend — returns empty list. */
  getGenericAlternatives: async (_productId: string) => ({
    data: { results: [] as Product[] },
  }),
};
