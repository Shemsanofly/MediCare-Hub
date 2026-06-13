import StatusBadge from '@/components/dashboard/StatusBadge';

const WORKFLOW_STEPS = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
] as const;

interface StatusProgressTrackerProps {
  status: string;
}

const StatusProgressTracker = ({ status }: StatusProgressTrackerProps) => {
  if (status === 'REJECTED') {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3">
        <StatusBadge status="REJECTED" />
        <p className="mt-2 text-sm text-red-700">This order was rejected by the supplier.</p>
      </div>
    );
  }

  const activeIndex = WORKFLOW_STEPS.indexOf(status as (typeof WORKFLOW_STEPS)[number]);
  const currentIndex = activeIndex >= 0 ? activeIndex : 0;

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[640px] items-center gap-2">
        {WORKFLOW_STEPS.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <div key={step} className="flex flex-1 items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                    isComplete
                      ? 'bg-secondary text-white'
                      : isCurrent
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {index + 1}
                </div>
                <span
                  className={`text-center text-[10px] font-medium uppercase tracking-wide ${
                    isCurrent ? 'text-primary' : isComplete ? 'text-secondary' : 'text-gray-400'
                  }`}
                >
                  {step.replace(/_/g, ' ')}
                </span>
              </div>
              {index < WORKFLOW_STEPS.length - 1 ? (
                <div
                  className={`mb-4 h-0.5 flex-1 ${
                    index < currentIndex ? 'bg-secondary' : 'bg-gray-200'
                  }`}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StatusProgressTracker;
