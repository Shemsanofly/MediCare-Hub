import { apiClient } from './axiosConfig';
import type {
  AdminDashboardSummary,
  HospitalDashboardSummary,
  SupplierDashboardSummary,
} from '@/types/dashboard';

export const dashboardApi = {
  getHospitalSummary: () =>
    apiClient.get<HospitalDashboardSummary>('/dashboard/hospital/summary/'),

  getSupplierSummary: () =>
    apiClient.get<SupplierDashboardSummary>('/dashboard/supplier/summary/'),

  getAdminSummary: () =>
    apiClient.get<AdminDashboardSummary>('/dashboard/admin/summary/'),
};
