import type { BackendOrder } from '@/api/ordersApi';

export interface StatusBreakdownItem {
  status: string;
  count: number;
}

export interface SpendingPoint {
  month: string;
  amount: string;
}

export interface DashboardPayment {
  id: string;
  order_id: string;
  amount: string;
  currency: string;
  status: string;
  gateway: string;
  initiated_at: string;
}

export interface TopSupplier {
  supplier_name: string;
  order_count: number;
  total_spent: string;
}

export interface RecentProductOrdered {
  product_id: string;
  product_name: string;
  quantity: number;
  order_id: string;
  ordered_at: string;
}

export interface HospitalDashboardSummary {
  total_orders: number;
  pending_orders: number;
  delivered_orders: number;
  monthly_spending: string;
  currency: string;
  cart_items: number;
  recent_orders: BackendOrder[];
  recent_payments: DashboardPayment[];
  status_breakdown: StatusBreakdownItem[];
  spending_overview: SpendingPoint[];
  recent_products_ordered: RecentProductOrdered[];
  top_suppliers: TopSupplier[];
  quick_stats: Record<string, string | number>;
}

export interface SupplierProductSummary {
  id: string;
  name: string;
  price: string;
  currency: string;
  is_active: boolean;
  stock: number;
  unit_of_measure: string;
}

export interface LowStockAlert {
  product_id: string;
  product_name: string;
  stock: number;
  threshold: number;
}

export interface ProductPerformance {
  product_id: string;
  product_name: string;
  units_sold: number;
  revenue: string;
}

export interface SupplierDashboardSummary {
  supplier_id: string | null;
  total_products: number;
  active_products: number;
  low_stock_products: number;
  total_orders_received: number;
  pending_orders: number;
  total_revenue: string;
  currency: string;
  my_products: SupplierProductSummary[];
  recent_orders: BackendOrder[];
  inventory_status: Array<{
    product_id: string;
    product_name: string;
    stock: number;
    is_active: boolean;
    price: string;
  }>;
  low_stock_alerts: LowStockAlert[];
  sales_summary: SpendingPoint[];
  product_performance: ProductPerformance[];
  quick_stats: Record<string, boolean | number | string>;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  full_name: string;
  role: string;
  organisation_name: string | null;
  created_at: string;
}

export interface VerificationRequest {
  id: string;
  organisation_name: string;
  verification_status: string;
  created_at: string;
}

export interface ProductActivity {
  id: string;
  name: string;
  supplier_name: string;
  is_active: boolean;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  user_email: string | null;
  created_at: string;
}

export interface AdminDashboardSummary {
  total_users: number;
  total_hospitals: number;
  total_suppliers: number;
  pending_verifications: number;
  total_products: number;
  total_orders: number;
  platform_revenue: string;
  currency: string;
  recent_users: AdminUserSummary[];
  recent_orders: BackendOrder[];
  verification_requests: VerificationRequest[];
  product_activity: ProductActivity[];
  revenue_overview: SpendingPoint[];
  activity_logs: ActivityLog[];
  quick_stats: Record<string, number>;
}
