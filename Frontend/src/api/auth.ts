import api from './axios';
import { ApiResponse, LoginResponse } from '@/types';

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

  registerApple: async (data: {
    identityToken: string;
    nonce: string;
    firstName?: string;
    lastName?: string;
    language?: string;
    gender?: string;
    genderIsSet?: boolean;
    preferredHandLeft?: boolean;
    preferredHandRight?: boolean;
    preferredCourtSideLeft?: boolean;
    preferredCourtSideRight?: boolean;
  }) => {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/register/apple', data);
    return response.data;
  },

  loginApple: async (data: { identityToken: string; nonce: string; language?: string; firstName?: string; lastName?: string }) => {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/login/apple', data);
    return response.data;
  },

  registerGoogle: async (data: {
    idToken: string;
    firstName?: string;
    lastName?: string;
    language?: string;
    gender?: string;
    genderIsSet?: boolean;
    preferredHandLeft?: boolean;
    preferredHandRight?: boolean;
    preferredCourtSideLeft?: boolean;
    preferredCourtSideRight?: boolean;
  }) => {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/register/google', data);
    return response.data;
  },

  loginGoogle: async (data: { 
    idToken: string; 
    language?: string; 
    firstName?: string; 
    lastName?: string;
  }) => {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/login/google', data);
    return response.data;
  },

  linkApple: async (data: {
    identityToken: string;
    nonce: string;
  }) => {
    const response = await api.post<ApiResponse<{ user: any }>>('/auth/link/apple', data);
    return response.data;
  },

  unlinkApple: async () => {
    const response = await api.post<ApiResponse<{ user: any }>>('/auth/unlink/apple');
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
};

