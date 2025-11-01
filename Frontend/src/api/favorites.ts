import api from './axios';
import { ApiResponse } from '@/types';

export const favoritesApi = {
  addToFavorites: async (clubId: string) => {
    const response = await api.post<ApiResponse<any>>('/favorites', {
      clubId,
    });
    return response.data;
  },

  removeFromFavorites: async (clubId: string) => {
    const response = await api.delete<ApiResponse<{ success: boolean }>>(`/favorites/${clubId}`);
    return response.data;
  },

  addUserToFavorites: async (userId: string) => {
    const response = await api.post<ApiResponse<any>>('/favorites/users', {
      userId,
    });
    return response.data;
  },

  removeUserFromFavorites: async (userId: string) => {
    const response = await api.delete<ApiResponse<{ success: boolean }>>(`/favorites/users/${userId}`);
    return response.data;
  },
};
