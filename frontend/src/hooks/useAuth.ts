import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { toast } from 'sonner';

import { authApi } from '@/api';
import { useAppDispatch, useAppSelector } from '@/hooks/useAppStore';
import {
  clearAuth,
  setAccessToken,
  setLoading,
  setSessionRestored,
  setUser,
} from '@/store/slices/authSlice';
import type { ApiErrorResponse, LoginRequest, RegistrationRequest } from '@/types';
import { getDashboardPath } from '@/utils/routing';

/** Authentication hook — access token in Redux memory only; refresh via HttpOnly cookie. */
export const useAuth = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, accessToken, isAuthenticated, isLoading, sessionRestored } =
    useAppSelector((state) => state.auth);

  const role = user?.role ?? null;

  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      dispatch(setLoading(true));
      const { data } = await authApi.refresh();
      dispatch(setAccessToken(data.access));

      const { data: profile } = await authApi.getCurrentUser();
      dispatch(setUser(profile));
      queryClient.setQueryData(['currentUser'], profile);
      return true;
    } catch {
      dispatch(clearAuth());
      return false;
    } finally {
      dispatch(setLoading(false));
      dispatch(setSessionRestored(true));
    }
  }, [dispatch, queryClient]);

  const login = useCallback(
    async (credentials: LoginRequest, redirectPath?: string) => {
      dispatch(setLoading(true));
      try {
        const { data } = await authApi.login(credentials);
        dispatch(setAccessToken(data.access));
        dispatch(setUser(data.user));
        queryClient.setQueryData(['currentUser'], data.user);
        toast.success(`Welcome back, ${data.user.full_name || data.user.email}`);
        navigate(redirectPath ?? getDashboardPath(data.user.role));
      } finally {
        dispatch(setLoading(false));
      }
    },
    [dispatch, navigate, queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Clear local state even if server logout fails.
    } finally {
      dispatch(clearAuth());
      queryClient.clear();
      navigate('/login');
      toast.success('Signed out successfully.');
    }
  }, [dispatch, navigate, queryClient]);

  return {
    user,
    isAuthenticated: isAuthenticated && Boolean(accessToken),
    role,
    isLoading,
    sessionRestored,
    login,
    logout,
    refreshToken,
  };
};

/** Restore session on app load via HttpOnly refresh cookie. */
export const useAuthInit = () => {
  const dispatch = useAppDispatch();
  const { sessionRestored, isAuthenticated } = useAppSelector((state) => state.auth);
  const { refreshToken } = useAuth();

  useEffect(() => {
    if (sessionRestored) {
      return;
    }

    if (isAuthenticated) {
      dispatch(setSessionRestored(true));
      return;
    }

    void refreshToken();
  }, [dispatch, isAuthenticated, refreshToken, sessionRestored]);
};

/** Register a new hospital or supplier account. */
export const useRegister = () => {
  const navigate = useNavigate();
  const [isPending, setIsPending] = useState(false);

  return {
    isPending,
    mutate: async (payload: RegistrationRequest) => {
      setIsPending(true);
      try {
        await authApi.register(payload);
        toast.success(
          'Account created! Check your email to verify your address before signing in.',
        );
        navigate('/login');
      } finally {
        setIsPending(false);
      }
    },
  };
};

/** Parse DRF field errors from an Axios error. */
export const parseApiFieldErrors = (
  error: unknown,
): Record<string, string> => {
  if (!(error instanceof AxiosError)) {
    return {};
  }

  const data = error.response?.data as ApiErrorResponse | undefined;
  if (!data) {
    return {};
  }

  const fieldErrors: Record<string, string> = {};

  Object.entries(data).forEach(([field, value]) => {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      fieldErrors[field] = value[0];
    }
  });

  if (typeof data.detail === 'string' && !fieldErrors.non_field_errors) {
    fieldErrors.non_field_errors = data.detail;
  }

  return fieldErrors;
};

/** Rate-limit lockout helpers (client-side UX; server enforces throttling). */
const FAILED_ATTEMPTS_KEY = 'medicare_login_failed_attempts';
const LOCKOUT_UNTIL_KEY = 'medicare_login_lockout_until';
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export const useLoginRateLimit = () => {
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(() => {
    const stored = sessionStorage.getItem(LOCKOUT_UNTIL_KEY);
    return stored ? Number(stored) : null;
  });
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (!lockoutUntil) {
      setSecondsRemaining(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        setLockoutUntil(null);
        sessionStorage.removeItem(LOCKOUT_UNTIL_KEY);
        sessionStorage.removeItem(FAILED_ATTEMPTS_KEY);
      }
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [lockoutUntil]);

  const recordFailedAttempt = useCallback(() => {
    const attempts = Number(sessionStorage.getItem(FAILED_ATTEMPTS_KEY) ?? '0') + 1;
    sessionStorage.setItem(FAILED_ATTEMPTS_KEY, String(attempts));

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      const until = Date.now() + LOCKOUT_DURATION_MS;
      sessionStorage.setItem(LOCKOUT_UNTIL_KEY, String(until));
      setLockoutUntil(until);
    }
  }, []);

  const resetAttempts = useCallback(() => {
    sessionStorage.removeItem(FAILED_ATTEMPTS_KEY);
    sessionStorage.removeItem(LOCKOUT_UNTIL_KEY);
    setLockoutUntil(null);
  }, []);

  return {
    isLockedOut: secondsRemaining > 0,
    secondsRemaining,
    recordFailedAttempt,
    resetAttempts,
  };
};
