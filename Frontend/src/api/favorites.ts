import api from './axios';
import { ApiResponse } from '@/types';
import type { BasicUser } from '@/types';

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

  getUserFavoriteUserIds: async (): Promise<string[]> => {
    const response = await api.get<ApiResponse<string[]>>('/favorites/users');
    return response.data.data;
  },

  getFollowing: async (): Promise<BasicUser[]> => {
    const response = await api.get<ApiResponse<BasicUser[]>>('/favorites/users/following');
    return response.data.data;
  },

  getFollowers: async (): Promise<BasicUser[]> => {
    const response = await api.get<ApiResponse<BasicUser[]>>('/favorites/users/followers');
    return response.data.data;
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

  getUserFavoriteClubIds: async (): Promise<string[]> => {
    const response = await api.get<ApiResponse<any[]>>('/favorites');
    return response.data.data.map((fav: any) => fav.clubId);
  },
};
