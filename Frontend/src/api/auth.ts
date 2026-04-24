import api from './axios';
import type { ApiResponse, AuthSessionRow, LoginResponse } from '@/types';

export const authApi = {
  registerPhone: async (data: {
    phone: string;
    password: string;
    firstName: string;
    lastName: string;
    email?: string;
    language?: string;
    gender?: string;
    genderIsSet?: boolean;
    preferredHandLeft?: boolean;
    preferredHandRight?: boolean;
    preferredCourtSideLeft?: boolean;
    preferredCourtSideRight?: boolean;
  }) => {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/register/phone', data);
    return response.data;
  },

  loginPhone: async (data: { phone: string; password: string; language?: string }) => {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/login/phone', data);
    return response.data;
  },

  registerTelegram: async (data: {
    telegramId: string;
    telegramUsername?: string;
    firstName: string;
    lastName: string;
    email?: string;
    language?: string;
    gender?: string;
    genderIsSet?: boolean;
    preferredHandLeft?: boolean;
    preferredHandRight?: boolean;
    preferredCourtSideLeft?: boolean;
    preferredCourtSideRight?: boolean;
  }) => {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/register/telegram', data);
    return response.data;
  },

  loginTelegram: async (data: { telegramId: string; language?: string }) => {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/login/telegram', data);
    return response.data;
  },

  verifyTelegramOtp: async (data: { code: string; telegramId?: string; language?: string }) => {
    const response = await api.post<ApiResponse<LoginResponse>>('/telegram/verify-otp', data);
    return response.data;
  },

  verifyTelegramLinkKey: async (data: { key: string; language?: string }) => {
    const response = await api.post<ApiResponse<LoginResponse>>('/telegram/verify-link-key', data);
    return response.data;
  },

  loginApple: async (data: {
    identityToken: string;
    nonce: string;
    language?: string;
    firstName?: string;
    lastName?: string;
    gender?: string;
    genderIsSet?: boolean;
    preferredHandLeft?: boolean;
    preferredHandRight?: boolean;
    preferredCourtSideLeft?: boolean;
    preferredCourtSideRight?: boolean;
  }) => {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/login/apple', data);
    return response.data;
  },

  loginGoogle: async (data: {
    idToken: string;
    language?: string;
    firstName?: string;
    lastName?: string;
    gender?: string;
    genderIsSet?: boolean;
    preferredHandLeft?: boolean;
    preferredHandRight?: boolean;
    preferredCourtSideLeft?: boolean;
    preferredCourtSideRight?: boolean;
  }) => {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/login/google', data);
    return response.data;
  },

  linkApple: async (data: {
    identityToken: string;
    nonce: string;
  }) => {
    console.log('[APPLE_API] linkApple called', { hasIdentityToken: !!data.identityToken, hasNonce: !!data.nonce });
    const response = await api.post<ApiResponse<{ user: any }>>('/auth/link/apple', data);
    console.log('[APPLE_API] linkApple response received');
    return response.data;
  },

  unlinkApple: async () => {
    console.log('[APPLE_API] unlinkApple called');
    const response = await api.post<ApiResponse<{ user: any }>>('/auth/unlink/apple');
    console.log('[APPLE_API] unlinkApple response received');
    return response.data;
  },

  linkGoogle: async (data: {
    idToken: string;
  }) => {
    const response = await api.post<ApiResponse<{ user: any }>>('/auth/link/google', data);
    return response.data;
  },

  unlinkGoogle: async () => {
    const response = await api.post<ApiResponse<{ user: any }>>('/auth/unlink/google');
    return response.data;
  },

  logoutWithRefresh: async (body?: { refreshToken?: string }) => {
    await api.post('/auth/logout', body ?? {});
  },

  logoutAllSessions: async () => {
    const response = await api.post<ApiResponse<Record<string, never>>>('/auth/logout-all');
    return response.data;
  },

  getSessions: async () => {
    const response = await api.get<ApiResponse<{ sessions: AuthSessionRow[] }>>('/auth/sessions');
    return response.data;
  },

  revokeSession: async (sessionId: string) => {
    const response = await api.delete<ApiResponse<{ revokedCurrentWebRefresh: boolean }>>(
      `/auth/sessions/${sessionId}`
    );
    return response.data;
  },
};

