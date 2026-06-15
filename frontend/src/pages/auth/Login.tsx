import { zodResolver } from '@hookform/resolvers/zod';
import { AxiosError } from 'axios';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import {
  isEmailNotVerifiedError,
  parseApiFieldErrors,
  useAuth,
  useLoginRateLimit,
  useResendVerification,
} from '@/hooks/useAuth';
import { useAppSelector } from '@/hooks/useAppStore';
import { loginSchema, type LoginFormValues } from '@/utils/validationSchemas';

const inputClassName =
  'w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

/** Sign-in page with React Hook Form, Zod validation, and rate-limit UI. */
const Login = () => {
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const justRegistered = searchParams.get('justRegistered') === '1';
  const registeredEmail = searchParams.get('email') || '';
  const verifiedParam = searchParams.get('verified'); // '1' or '0'
  const { isLoading } = useAppSelector((state) => state.auth);
  const { login } = useAuth();
  const { isLockedOut, secondsRemaining, recordFailedAttempt, resetAttempts } =
    useLoginRateLimit();
  const resendVerification = useResendVerification();
  const [lastLoginError, setLastLoginError] = useState<string | null>(null);
  const [emailNotVerified, setEmailNotVerified] = useState(false);

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

    setLastLoginError(null);
    setEmailNotVerified(false);

    try {
      await login(values, returnUrl ?? undefined);
      resetAttempts();
    } catch (error) {
      recordFailedAttempt();

      if (isEmailNotVerifiedError(error)) {
        // Friendlier message + a "resend" affordance below the form.
        setEmailNotVerified(true);
        setError('email', {
          message:
            'Your email is not verified yet. Check your inbox for the verification link we sent.',
        });
        setLastLoginError(null);
        applyFieldErrors(error); // best-effort; usually no field-level errors
        return;
      }

      applyFieldErrors(error);
      setLastLoginError(
        error instanceof AxiosError && !error.response?.data
          ? 'Unable to connect. Please try again.'
          : null,
      );
    }
  };

  const getEmailTarget = () =>
    registeredEmail ||
    (typeof window !== 'undefined'
      ? (document.getElementById('email') as HTMLInputElement | null)?.value || ''
      : '');

  const handleResend = () => {
    const target = getEmailTarget();
    if (!target) {
      toast.error('Enter your email above first, then click resend.');
      return;
    }
    resendVerification.mutate(target, {
      onSuccess: () => toast.success('Verification email sent. Check your inbox.'),
      onError: () => toast.error('Could not send verification email. Please try again.'),
    });
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

        {/* Post-registration banner: account created, must verify before sign-in. */}
        {justRegistered && (
          <div
            role="status"
            className="mb-5 rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-900"
          >
            <p className="font-semibold">✅ Account created!</p>
            <p className="mt-1 text-primary-800">
              We&apos;ve sent a verification link
              {registeredEmail ? (
                <>
                  {' '}to <span className="font-semibold">{registeredEmail}</span>
                </>
              ) : null}
              . Click it to activate your account, then sign in. The link expires in 24 hours.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendVerification.isPending}
                className="rounded-md border border-primary bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary-100 disabled:opacity-60"
              >
                {resendVerification.isPending ? 'Sending…' : 'Resend verification email'}
              </button>
              <Link
                to="/register"
                className="rounded-md border border-transparent bg-white px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100"
              >
                Use a different email
              </Link>
            </div>
          </div>
        )}

        {/* Banner shown when the user clicks the link from their verification email. */}
        {verifiedParam === '1' && (
          <div
            role="status"
            className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
          >
            <p className="font-semibold">✅ Email verified</p>
            <p className="mt-1">You can now sign in with your credentials.</p>
          </div>
        )}

        {verifiedParam === '0' && (
          <div
            role="status"
            className="mb-5 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
          >
            <p className="font-semibold">⚠️ That verification link is invalid or expired.</p>
            <p>
              You can request a new one below — enter the email you signed up with and click
              <span className="font-semibold"> Resend verification email</span>.
            </p>
          </div>
        )}

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
              defaultValue={registeredEmail}
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

          {/* Inline resend action when the most recent login failed because
              the email isn't verified. Mirrors the post-registration banner so
              the path to recovery is always one click away. */}
          {emailNotVerified && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Didn&apos;t get the email?{' '}
              <button
                type="button"
                onClick={handleResend}
                disabled={resendVerification.isPending}
                className="font-semibold underline disabled:opacity-60"
              >
                {resendVerification.isPending ? 'Sending…' : 'Resend verification email'}
              </button>
            </div>
          )}

          {lastLoginError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {lastLoginError}
            </p>
          )}

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
