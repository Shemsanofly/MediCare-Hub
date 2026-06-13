import { useEffect, useState } from 'react';

/**
 * Debounce a value by the given delay (ms).
 */
export const useDebounce = <T,>(value: T, delay = 300): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
};
