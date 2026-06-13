import { apiClient } from './axiosConfig';
import type { LoginRequest, LoginResponse, RegistrationRequest, User } from '@/types';

/** Authentication API endpoints. */
export const authApi = {
  register: (payload: RegistrationRequest) =>
    apiClient.post<User>('/auth/register/', payload),

  login: (credentials: LoginRequest) =>
    apiClient.post<LoginResponse>('/auth/login/', credentials),

  refresh: () =>
    apiClient.post<{ access: string }>('/auth/token/refresh/', {}),

  logout: () =>
    apiClient.post<void>('/auth/logout/'),

  getCurrentUser: () =>
    apiClient.get<User>('/auth/me/'),
};
