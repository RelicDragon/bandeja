import api from './axios';
import { ApiResponse } from '@/types';

export const blockedUsersApi = {
  blockUser: async (userId: string) => {
    const response = await api.post<ApiResponse<any>>('/blocked-users', {
      userId,
    });
    return response.data;
  },

  unblockUser: async (userId: string) => {
    const response = await api.delete<ApiResponse<{ success: boolean }>>(`/blocked-users/${userId}`);
    return response.data;
  },

  getBlockedUserIds: async (): Promise<string[]> => {
    const response = await api.get<ApiResponse<string[]>>('/blocked-users');
    return response.data.data;
  },

  getBlockedUsers: async () => {
    const response = await api.get<ApiResponse<Array<{
      id: string;
      userId: string;
      blockedUserId: string;
      createdAt: string;
      blockedUser: {
        id: string;
        firstName?: string;
        lastName?: string;
        avatar?: string | null;
      };
    }>>>('/blocked-users/list');
    return response.data;
  },

  checkIfUserBlocked: async (userId: string): Promise<boolean> => {
    const response = await api.get<ApiResponse<{ isBlocked: boolean }>>(`/blocked-users/check/${userId}`);
    return response.data.data.isBlocked;
  },

  checkIfBlockedByUser: async (userId: string): Promise<boolean> => {
    const response = await api.get<ApiResponse<{ isBlockedBy: boolean }>>(`/blocked-users/check-blocked-by/${userId}`);
    return response.data.data.isBlockedBy;
  },
};

