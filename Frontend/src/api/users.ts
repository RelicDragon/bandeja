import api from './axios';
import { ApiResponse, User, Gender } from '@/types';

export interface LevelHistoryItem {
  id: string;
  levelBefore: number;
  levelAfter: number;
  levelChange: number;
  createdAt: string;
}

export interface UserStats {
  user: User;
  levelHistory: LevelHistoryItem[];
  gamesLast30Days: number;
}

export interface InvitablePlayer {
  id: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  level: number;
  gender: Gender;
  telegramUsername?: string;
  interactionCount: number;
}

export const usersApi = {
  getProfile: async () => {
    const response = await api.get<ApiResponse<User>>('/users/profile');
    return response.data;
  },

  updateProfile: async (data: Partial<User>) => {
    const response = await api.put<ApiResponse<User>>('/users/profile', data);
    return response.data;
  },

  switchCity: async (cityId: string) => {
    const response = await api.post<ApiResponse<User>>('/users/switch-city', { cityId });
    return response.data;
  },

  getUserStats: async (userId: string) => {
    const response = await api.get<ApiResponse<UserStats>>(`/users/${userId}/stats`);
    return response.data;
  },

  getInvitablePlayers: async (gameId?: string) => {
    const response = await api.get<ApiResponse<InvitablePlayer[]>>('/users/invitable-players', {
      params: gameId ? { gameId } : {},
    });
    return response.data;
  },

  trackInteraction: async (targetUserId: string) => {
    const response = await api.post<ApiResponse<any>>('/users/track-interaction', {
      targetUserId,
    });
    return response.data;
  },
};

