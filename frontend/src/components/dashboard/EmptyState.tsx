interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

const EmptyState = ({ title, description, action }: EmptyStateProps) => (
  <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center">
    <p className="font-medium text-gray-700">{title}</p>
    {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export default EmptyState;
