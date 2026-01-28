import api from './axios';
import { ApiResponse, Club, EntityType } from '@/types';

export interface ClubMapItem {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  cityName: string;
  country: string;
  courtsCount: number;
}

export const clubsApi = {
  getForMap: async () => {
    const response = await api.get<ApiResponse<ClubMapItem[]>>('/clubs/map');
    return response.data;
  },

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
