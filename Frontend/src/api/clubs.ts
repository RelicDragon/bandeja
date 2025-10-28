import api from './axios';
import { ApiResponse, Club, EntityType } from '@/types';

export const clubsApi = {
  getByCityId: async (cityId: string, entityType?: EntityType) => {
    const params = entityType ? { entityType } : {};
    const response = await api.get<ApiResponse<Club[]>>(`/clubs/city/${cityId}`, { params });
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<Club>>(`/clubs/${id}`);
    return response.data;
  },
};
