/** User roles matching the Django backend RBAC model. */

export type UserRole = 'HOSPITAL' | 'SUPPLIER' | 'ADMIN';



/** Organisation profile nested in user responses. */

export interface Organisation {

  id: string;

  name: string;

  type: 'HOSPITAL' | 'SUPPLIER' | 'PHARMACY' | 'LAB';

  registration_number: string;

  tmda_license: string;

  is_verified: boolean;

  verified_at: string | null;

  created_at: string;

}



/** Authenticated user profile returned by the API. */

export interface User {

  id: string;

  email: string;

  first_name: string;

  last_name: string;

  full_name: string;

  role: UserRole;

  organisation: Organisation | null;

  is_active: boolean;

  is_verified: boolean;

  mfa_enabled: boolean;

  last_login_ip: string | null;

  created_at: string;

  updated_at: string;

}



/** JWT access token returned on login (refresh token is HttpOnly cookie). */

export interface TokenPair {

  access: string;

  refresh?: string;

  user?: User;

}



/** Login response — refresh token is set as HttpOnly cookie by the server. */

export interface LoginResponse {

  access: string;

  user: User;

}



/** Registration request payload. */

export interface RegistrationRequest {

  email: string;

  password: string;

  first_name: string;

  last_name: string;

  role: 'HOSPITAL' | 'SUPPLIER';

  organisation_name: string;

  organisation_type: Organisation['type'];

  registration_number?: string;

  tmda_license?: string;

}



/** Login request payload. */

export interface LoginRequest {

  email: string;

  password: string;

}



/** Token refresh request payload. */

export interface TokenRefreshRequest {

  refresh: string;

}



/** Standard paginated list response from DRF. */

export interface PaginatedResponse<T> {

  count: number;

  next: string | null;

  previous: string | null;

  results: T[];

}



/** Generic API success wrapper for non-paginated endpoints. */

export interface ApiResponse<T> {

  data: T;

  message?: string;

}



/** Field-level validation errors from DRF serializers. */

export type ValidationErrors = Record<string, string[]>;



/** Structured API error shape. */

export interface ApiError {

  status: number;

  message: string;

  detail?: string;

  errors?: ValidationErrors;

}



/** Axios error response body from DRF. */

export interface ApiErrorResponse {

  detail?: string;

  message?: string;

  [key: string]: string | string[] | undefined;

}



/** Cart line item (client-side until orders API is wired). */

export interface CartItem {

  productId: string;

  name: string;

  quantity: number;

  unitPrice: number;

  currency?: string;

}



/** Hospital dashboard KPI metrics. */

export interface HospitalKPIs {

  monthly_spend: {

    amount: number;

    currency: string;

    trend_percent: number;

  };

  active_orders: {

    count: number;

    pending_approval: number;

  };

  stock_alerts: {

    count: number;

  };

  avg_supplier_rating: {

    rating: number;

    max: number;

  };

}



/** Stock alert below reorder point. */

export interface StockAlert {

  id: string;

  product_id: string;

  product_name: string;

  current_stock: number;

  reorder_point: number;

  days_remaining: number;

  recommended_order_quantity: number;

  unit_price: number;

  currency: string;

}



/** AI forecast or seasonal demand alert. */

export interface ForecastAlert {

  id: string;

  alert_type: 'stockout' | 'seasonal';

  product_id?: string;

  product_name?: string;

  message: string;

  days_until_stockout?: number;

  severity: 'low' | 'medium' | 'high';

  season?: string;

}



/** Order pending approval. */

export interface PendingApprovalOrder {

  id: string;

  order_number: string;

  supplier_name: string;

  amount: number;

  currency: string;

  requested_by: string;

  created_at: string;

  items: OrderLineItem[];

}



/** Order line item. */

export interface OrderLineItem {

  id: string;

  product_name: string;

  quantity: number;

  unit_price: number;

  total_price: number;

}



/** Recent order summary. */

export interface RecentOrder {

  id: string;

  order_number: string;

  supplier_name: string;

  amount: number;

  currency: string;

  status: OrderStatus;

  created_at: string;

  items: OrderLineItem[];

}



export type OrderStatus =

  | 'DRAFT'

  | 'PENDING'

  | 'PENDING_APPROVAL'

  | 'ACCEPTED'

  | 'REJECTED'

  | 'PREPARING'

  | 'APPROVED'

  | 'CONFIRMED'

  | 'PAID'

  | 'PROCESSING'

  | 'SHIPPED'

  | 'DELIVERED'

  | 'COMPLETED'

  | 'CANCELLED'

  | 'DISPUTED';



/** Product category with optional children. */

export interface Category {

  id: string;

  name: string;

  parent: string | null;

  is_regulated: boolean;

  tmda_required: boolean;

  children?: Category[];

}



/** Supplier summary on product cards. */

export interface SupplierSummary {

  id: string;

  organisation_name: string;

  supplier_rating: number;

  trust_score: number;

  average_delivery_days: string;

  verification_status: string;

}



/** Product batch with expiry info. */

export interface ProductBatch {

  id: string;

  batch_number: string;

  manufacturing_date?: string;

  manufacture_date?: string;

  expiry_date: string;

  quantity?: number;

  reserved_quantity?: number;

  available_quantity: number;

  quantity_available?: number;

  unit_cost?: string;

  status: string;

  storage_conditions: string;

  tmda_batch_cert_number: string;

  created_at: string;

  updated_at?: string;

}



/** Marketplace product. */

export interface Product {

  id: string;

  name: string;

  generic_name: string;

  gtin: string;

  description: string;

  unit_of_measure: string;

  price: string;

  currency: string;

  minimum_order_quantity: number;

  is_cold_chain_required: boolean;

  temperature_range_min: string | null;

  temperature_range_max: string | null;

  tmda_registration_number: string;

  is_active: boolean;

  category: Category;

  supplier: SupplierSummary;

  batches: ProductBatch[];

  total_quantity_available: number;

  inventory_status?: string;

  created_at: string;

  updated_at: string;

}



/** Price history data point for charts. */

export interface PriceHistoryPoint {

  month: string;

  price: number;

}



/** Product catalog query filters. */

export interface ProductFilters {

  search?: string;

  category?: string;

  supplier?: string;

  min_price?: number;

  max_price?: number;

  cold_chain_required?: boolean;

  in_stock?: boolean;

  cursor?: string;

  page_size?: number;

  valid_expiry?: boolean | string;

}



/** In-app notification item. */

export interface AppNotification {

  id: string;

  title: string;

  message: string;

  type: 'info' | 'success' | 'warning' | 'error';

  read: boolean;

  createdAt: string;

}

