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
    preferredHandLeft?: boolean;
    preferredHandRight?: boolean;
    preferredCourtSideLeft?: boolean;
    preferredCourtSideRight?: boolean;
  }) => {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/register/phone', data);
    return response.data;
  },

  loginPhone: async (data: { phone: string; password: string }) => {
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
    preferredHandLeft?: boolean;
    preferredHandRight?: boolean;
    preferredCourtSideLeft?: boolean;
    preferredCourtSideRight?: boolean;
  }) => {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/register/telegram', data);
    return response.data;
  },

  loginTelegram: async (data: { telegramId: string }) => {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/login/telegram', data);
    return response.data;
  },

  verifyTelegramOtp: async (data: { code: string; telegramId?: string }) => {
    const response = await api.post<ApiResponse<LoginResponse>>('/telegram/verify-otp', data);
    return response.data;
  },
};

