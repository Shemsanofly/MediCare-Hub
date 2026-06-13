import { zodResolver } from '@hookform/resolvers/zod';
import { AxiosError } from 'axios';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';

import {
  parseApiFieldErrors,
  useAuth,
  useLoginRateLimit,
} from '@/hooks/useAuth';
import { useAppSelector } from '@/hooks/useAppStore';
import { loginSchema, type LoginFormValues } from '@/utils/validationSchemas';

const inputClassName =
  'w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

/** Sign-in page with React Hook Form, Zod validation, and rate-limit UI. */
const Login = () => {
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const { isLoading } = useAppSelector((state) => state.auth);
  const { login } = useAuth();
  const { isLockedOut, secondsRemaining, recordFailedAttempt, resetAttempts } =
    useLoginRateLimit();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const applyFieldErrors = (error: unknown) => {
    const fieldErrors = parseApiFieldErrors(error);

    Object.entries(fieldErrors).forEach(([field, message]) => {
      if (field === 'email' || field === 'password') {
        setError(field, { message });
      } else if (field === 'non_field_errors') {
        setError('email', { message });
      }
    });
  };

  const onSubmit = async (values: LoginFormValues) => {
    if (isLockedOut) {
      return;
    }

    try {
      await login(values, returnUrl ?? undefined);
      resetAttempts();
    } catch (error) {
      recordFailedAttempt();
      applyFieldErrors(error);

      if (error instanceof AxiosError && !error.response?.data) {
        setError('email', { message: 'Unable to connect. Please try again.' });
      }
    }
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 to-secondary-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-primary">MediCare Hub</h1>
          <p className="mt-2 text-sm text-gray-500">
            B2B Healthcare Procurement for East Africa
          </p>
        </div>

        {isLockedOut && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Too many failed attempts. Try again in{' '}
            <span className="font-semibold">{formatCountdown(secondsRemaining)}</span>.
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className={inputClassName}
              {...register('email')}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className={inputClassName}
              {...register('password')}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || isLockedOut}
            className="w-full rounded-lg bg-primary py-2.5 font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLockedOut
              ? `Try again in ${formatCountdown(secondsRemaining)}`
              : isLoading
                ? 'Signing in…'
                : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-primary hover:text-primary-600">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
