import { useQuery } from '@tanstack/react-query';
import { paymentsApi } from '@/api';
import { PaymentMethodLogo } from './PaymentMethodLogo';

interface PaymentMethodSelectorProps {
  selected: string | null;
  onSelect: (methodId: string) => void;
  disabled?: boolean;
}

export function PaymentMethodSelector({ selected, onSelect, disabled }: PaymentMethodSelectorProps) {
  const methodsQuery = useQuery({
    queryKey: ['paymentMethods'],
    queryFn: async () => {
      const { data } = await paymentsApi.getPaymentMethods();
      return data.results;
    },
  });

  const methods = methodsQuery.data ?? [];

  if (methodsQuery.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {methods.map((method) => {
        const isSelected = selected === method.id;
        return (
          <button
            key={method.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(method.id)}
            className={[
              'flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition',
              'hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30',
              isSelected ? 'border-primary bg-primary/5' : 'border-gray-100 bg-white',
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            ].join(' ')}
          >
            <PaymentMethodLogo methodId={method.id} />
            <span className="text-xs text-gray-500">{method.network}</span>
          </button>
        );
      })}
    </div>
  );
}
