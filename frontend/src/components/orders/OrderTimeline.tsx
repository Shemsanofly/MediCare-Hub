import StatusBadge from '@/components/dashboard/StatusBadge';

export interface OrderStatusHistoryEntry {
  id: string;
  from_status: string;
  to_status: string;
  changed_by_email: string | null;
  changed_by_role: string | null;
  reason: string;
  created_at: string;
}

interface OrderTimelineProps {
  history: OrderStatusHistoryEntry[];
  orderCreatedAt: string;
  currentStatus: string;
}

const OrderTimeline = ({
  history,
  orderCreatedAt,
  currentStatus,
}: OrderTimelineProps) => {
  const events =
    history.length > 0
      ? history
      : [
          {
            id: 'created',
            from_status: '',
            to_status: currentStatus,
            changed_by_email: null,
            changed_by_role: null,
            reason: 'Order placed',
            created_at: orderCreatedAt,
          },
        ];

  return (
    <ol className="relative space-y-6 border-l border-gray-200 pl-6">
      {events.map((entry) => (
        <li key={entry.id} className="relative">
          <span className="absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-primary shadow" />
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={entry.to_status} />
            <span className="text-xs text-gray-500">
              {new Date(entry.created_at).toLocaleString()}
            </span>
          </div>
          {entry.changed_by_email ? (
            <p className="mt-1 text-sm text-gray-600">
              by {entry.changed_by_email}
              {entry.changed_by_role ? ` (${entry.changed_by_role})` : ''}
            </p>
          ) : null}
          {entry.reason ? (
            <p className="mt-1 text-sm text-gray-500">{entry.reason}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
};

export default OrderTimeline;
