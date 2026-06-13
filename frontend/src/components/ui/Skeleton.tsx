interface SkeletonProps {
  className?: string;
}

/** Base skeleton shimmer block. */
export const Skeleton = ({ className = '' }: SkeletonProps) => (
  <div className={`animate-pulse rounded-md bg-gray-200 ${className}`} />
);

/** Skeleton for KPI metric cards. */
export const KPICardSkeleton = () => (
  <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <Skeleton className="mb-3 h-4 w-24" />
    <Skeleton className="mb-2 h-8 w-32" />
    <Skeleton className="h-3 w-20" />
  </div>
);

/** Skeleton for table rows. */
export const TableRowSkeleton = ({ columns = 5 }: { columns?: number }) => (
  <tr>
    {Array.from({ length: columns }).map((_, index) => (
      <td key={index} className="px-4 py-3">
        <Skeleton className="h-4 w-full max-w-[120px]" />
      </td>
    ))}
  </tr>
);

/** Skeleton for product cards in catalog grid. */
export const ProductCardSkeleton = () => (
  <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
    <Skeleton className="mb-3 h-5 w-3/4" />
    <Skeleton className="mb-2 h-4 w-1/2" />
    <Skeleton className="mb-4 h-4 w-1/3" />
    <Skeleton className="mb-3 h-6 w-24" />
    <Skeleton className="h-10 w-full" />
  </div>
);

/** Skeleton for alert cards. */
export const AlertCardSkeleton = () => (
  <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
    <Skeleton className="mb-2 h-5 w-2/3" />
    <Skeleton className="mb-1 h-4 w-full" />
    <Skeleton className="h-4 w-4/5" />
  </div>
);
