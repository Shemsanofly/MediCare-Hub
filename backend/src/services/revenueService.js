import { formatDecimal } from '../utils/helpers.js';

export function getPlatformFeeRate(purchaseAmount) {
  const amount = Number(purchaseAmount) || 0;
  if (amount < 1000) return 0;
  if (amount < 10000) return 0.02;
  if (amount < 1000000) return 0.03;
  return 0.05;
}

export function calculateRevenueSplit(purchaseAmount) {
  const amount = Number(purchaseAmount) || 0;
  const platformFeeRate = getPlatformFeeRate(amount);
  const buyerFeeRate = platformFeeRate / 2;
  const supplierFeeRate = platformFeeRate / 2;
  const buyerServiceFee = amount * buyerFeeRate;
  const supplierServiceFee = amount * supplierFeeRate;
  const platformRevenue = buyerServiceFee + supplierServiceFee;

  return {
    platform_fee_rate: platformFeeRate,
    buyer_service_fee: buyerServiceFee,
    supplier_service_fee: supplierServiceFee,
    platform_revenue: platformRevenue,
    supplier_net_amount: amount - supplierServiceFee,
  };
}

export function serializeRevenueFields(order) {
  return {
    platform_fee_rate: formatDecimal((Number(order.platform_fee_rate) || 0) * 100),
    buyer_service_fee: formatDecimal(order.buyer_service_fee || 0),
    supplier_service_fee: formatDecimal(order.supplier_service_fee || 0),
    platform_revenue: formatDecimal(order.platform_revenue || 0),
    supplier_net_amount: formatDecimal(order.supplier_net_amount || 0),
  };
}
