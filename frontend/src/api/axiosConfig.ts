import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { toast } from 'sonner';

import { store } from '@/store';
import { clearAuth, setAccessToken } from '@/store/slices/authSlice';
import type { ApiErrorResponse } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/** Shared Axios instance for all MediCare Hub API calls. */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30_000,
  withCredentials: true,
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

/**
 * Drain the queue of requests waiting for a token refresh.
 */
const processQueue = (error: unknown | null, token: string | null = null): void => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  failedQueue = [];
};

/**
 * Extract a human-readable message from a DRF error response.
 */
export const extractErrorMessage = (error: AxiosError<ApiErrorResponse>): string => {
  const data = error.response?.data;

  if (!data) {
    return error.message || 'An unexpected network error occurred.';
  }

  if (typeof data.detail === 'string') {
    return data.detail;
  }

  if (typeof data.message === 'string') {
    return data.message;
  }

  const fieldErrors = Object.entries(data)
    .filter(([, value]) => Array.isArray(value))
    .flatMap(([field, messages]) =>
      (messages as string[]).map((msg) => `${field}: ${msg}`),
    );

  if (fieldErrors.length > 0) {
    return fieldErrors.join('. ');
  }

  return 'An unexpected error occurred.';
};

/** Attach JWT access token to outgoing requests (memory-only, never localStorage). */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = store.getState().auth;

    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error: unknown) => Promise.reject(error),
);

/** Handle 401 token refresh via HttpOnly cookie and surface errors as toasts. */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError<ApiErrorResponse>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      error.response?.status === 401
      && originalRequest
      && !originalRequest._retry
      && !originalRequest.url?.includes('/auth/token/')
      && !originalRequest.url?.includes('/auth/login/')
    ) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post<{ access: string }>(
          `${API_BASE_URL}/auth/token/refresh/`,
          {},
          { withCredentials: true },
        );

        store.dispatch(setAccessToken(data.access));
        processQueue(null, data.access);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.access}`;
        }

        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        store.dispatch(clearAuth());
        toast.error('Session expired. Please sign in again.');
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    const isAuthEndpoint = originalRequest?.url?.includes('/auth/');
    const message = extractErrorMessage(error);

    if (error.response?.status !== 401 && !isAuthEndpoint) {
      toast.error(message);
    }

    return Promise.reject(error);
  },
);
