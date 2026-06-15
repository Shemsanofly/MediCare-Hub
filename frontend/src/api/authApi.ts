import { apiClient } from './axiosConfig';
import type { LoginRequest, LoginResponse, RegistrationRequest, User } from '@/types';

export interface KycQuestion {
  id: string;
  prompt: string;
}

export interface KycChallenge {
  nida_masked: string;
  required_correct: number;
  total: number;
  questions: KycQuestion[];
}

/** Authentication API endpoints. */
export const authApi = {
  register: (payload: RegistrationRequest) =>
    apiClient.post<User>('/auth/register/', payload),

  /** Fetch the simulated NIDA KYC questions for a supplier's 20-digit NIDA. */
  kycQuestions: (nidaId: string) =>
    apiClient.post<KycChallenge>('/auth/kyc/questions/', { nida_id: nidaId }),

  login: (credentials: LoginRequest) =>
    apiClient.post<LoginResponse>('/auth/login/', credentials),

  refresh: () =>
    apiClient.post<{ access: string }>('/auth/token/refresh/', {}),

  logout: () =>
    apiClient.post<void>('/auth/logout/'),

  getCurrentUser: () =>
    apiClient.get<User>('/auth/me/'),

  /**
   * Request that the verification email be re-sent. Always returns 200
   * whether or not the email exists (to prevent enumeration), so the call
   * site should always show a generic "we've sent it" message.
   */
  resendVerification: (email: string) =>
    apiClient.post<{ message: string }>('/auth/resend-verification/', { email }),

  /** Verify an email with the 6-digit code from the verification email. */
  verifyEmailCode: (email: string, code: string) =>
    apiClient.post<{ message: string }>('/auth/verify-email-code/', { email, code }),
};
