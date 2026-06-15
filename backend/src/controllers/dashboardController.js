import { getHospitalDashboard, getSupplierDashboard, getAdminDashboard } from '../services/dashboardService.js';

export async function hospitalSummary(req, res, next) {
  try {
    res.json(getHospitalDashboard(req.user));
  } catch (error) {
    next(error);
  }
}

export async function supplierSummary(req, res, next) {
  try {
    res.json(getSupplierDashboard(req.user));
  } catch (error) {
    next(error);
  }
}

export async function adminSummary(req, res, next) {
  try {
    res.json(getAdminDashboard());
  } catch (error) {
    next(error);
  }
}
