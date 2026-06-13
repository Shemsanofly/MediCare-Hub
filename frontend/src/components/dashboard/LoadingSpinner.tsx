interface LoadingSpinnerProps {
  label?: string;
}

const LoadingSpinner = ({ label = 'Loading dashboard…' }: LoadingSpinnerProps) => (
  <div className="flex min-h-[240px] flex-col items-center justify-center gap-3">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    <p className="text-sm text-gray-500">{label}</p>
  </div>
);

export default LoadingSpinner;
