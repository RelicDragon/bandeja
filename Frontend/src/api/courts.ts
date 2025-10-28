import api from './axios';
import { ApiResponse, Court } from '@/types';

export const courtsApi = {
  getByClubId: async (clubId: string) => {
    const response = await api.get<ApiResponse<Court[]>>(`/courts/club/${clubId}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<Court>>(`/courts/${id}`);
    return response.data;
  },
};

