import api from './axios';
import type { ApiResponse, UserTeam, UserTeamMembership } from '@/types';

export const userTeamsApi = {
  getMine: async (): Promise<UserTeam[]> => {
    const res = await api.get<ApiResponse<UserTeam[]>>('/user-teams');
    return res.data.data;
  },

  getMemberships: async (): Promise<UserTeamMembership[]> => {
    const res = await api.get<ApiResponse<UserTeamMembership[]>>('/user-teams/memberships');
    return res.data.data;
  },

  getById: async (id: string): Promise<UserTeam> => {
    const res = await api.get<ApiResponse<UserTeam>>(`/user-teams/${id}`);
    return res.data.data;
  },

  create: async (data?: { name?: string; avatar?: string | null; originalAvatar?: string | null }): Promise<UserTeam> => {
    const res = await api.post<ApiResponse<UserTeam>>('/user-teams', data ?? {});
    return res.data.data;
  },

  update: async (
    id: string,
    data: {
      name?: string;
      avatar?: string | null;
      originalAvatar?: string | null;
      cutAngle?: number;
    }
  ): Promise<UserTeam> => {
    const res = await api.put<ApiResponse<UserTeam>>(`/user-teams/${id}`, data);
    return res.data.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/user-teams/${id}`);
  },

  invite: async (teamId: string, userId: string): Promise<{ team: UserTeam }> => {
    const res = await api.post<ApiResponse<{ team: UserTeam }>>(`/user-teams/${teamId}/invite`, { userId });
    return res.data.data;
  },

  accept: async (teamId: string): Promise<UserTeam> => {
    const res = await api.post<ApiResponse<UserTeam>>(`/user-teams/${teamId}/accept`);
    return res.data.data;
  },

  decline: async (teamId: string): Promise<void> => {
    await api.post(`/user-teams/${teamId}/decline`);
  },

  removeMember: async (teamId: string, userId: string): Promise<UserTeam | null> => {
    const res = await api.delete<ApiResponse<UserTeam | null>>(`/user-teams/${teamId}/members/${userId}`);
    return res.data.data;
  },
};
