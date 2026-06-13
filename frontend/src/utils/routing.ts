import type { UserRole } from '@/types';

/** Default dashboard path for each user role. */
export const ROLE_DASHBOARD_PATHS: Record<UserRole, string> = {
  HOSPITAL: '/hospital/dashboard',
  SUPPLIER: '/supplier/dashboard',
  ADMIN: '/admin/dashboard',
};

/**
 * Resolve the dashboard URL for a given role.
 */
export const getDashboardPath = (role: UserRole): string =>
  ROLE_DASHBOARD_PATHS[role];
