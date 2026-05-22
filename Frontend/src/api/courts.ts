import api from './axios';
import type { ApiResponse, Court, Sport } from '@/types';

export type CourtsByClubOptions = {
  sport?: Sport;
};

export const courtsApi = {
  getByClubId: async (clubId: string, options?: CourtsByClubOptions) => {
    const response = await api.get<ApiResponse<Court[]>>(`/courts/club/${clubId}`, {
      params: options?.sport ? { sport: options.sport } : undefined,
    });
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<Court>>(`/courts/${id}`);
    return response.data;
  },
};

