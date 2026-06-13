const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  ACCEPTED: 'bg-blue-100 text-blue-800',
  PREPARING: 'bg-indigo-100 text-indigo-800',
  COMPLETED: 'bg-secondary-100 text-secondary-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  CONFIRMED: 'bg-indigo-100 text-indigo-800',
  PAID: 'bg-purple-100 text-purple-800',
  PROCESSING: 'bg-orange-100 text-orange-800',
  SHIPPED: 'bg-cyan-100 text-cyan-800',
  DELIVERED: 'bg-secondary-100 text-secondary-800',
  CANCELLED: 'bg-gray-100 text-gray-500',
  DISPUTED: 'bg-red-100 text-red-800',
  FAILED: 'bg-red-100 text-red-800',
  VERIFIED: 'bg-secondary-100 text-secondary-800',
  REJECTED: 'bg-red-100 text-red-800',
  SUSPENDED: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-secondary-100 text-secondary-800',
  INACTIVE: 'bg-gray-100 text-gray-500',
  LOW_STOCK: 'bg-amber-100 text-amber-800',
  OUT_OF_STOCK: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-gray-100 text-gray-500',
  HOSPITAL: 'bg-blue-100 text-blue-800',
  SUPPLIER: 'bg-orange-100 text-orange-800',
  ADMIN: 'bg-purple-100 text-purple-800',
};

interface StatusBadgeProps {
  status: string;
}

const StatusBadge = ({ status }: StatusBadgeProps) => (
  <span
    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
      STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'
    }`}
  >
    {status.replace(/_/g, ' ')}
  </span>
);

export default StatusBadge;
