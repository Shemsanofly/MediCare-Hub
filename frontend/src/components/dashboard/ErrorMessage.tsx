interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

const ErrorMessage = ({ message, onRetry }: ErrorMessageProps) => (
  <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
    <p className="font-medium text-red-800">Failed to load dashboard</p>
    <p className="mt-1 text-sm text-red-600">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600"
      >
        Retry
      </button>
    )}
  </div>
);

export default ErrorMessage;
