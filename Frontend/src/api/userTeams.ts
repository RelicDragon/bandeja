import api from './axios';
import type { ApiResponse, EntityType, Sport, UserTeam, UserTeamMembership } from '@/types';

export type UserTeamInvitableGame = {
  id: string;
  name: string | null;
  sport: Sport;
  entityType: EntityType;
  startTime: string;
  endTime: string;
  timeIsSet: boolean;
  avatar: string | null;
  hasFixedTeams: boolean;
  maxParticipants: number;
  playingCount: number;
  club: { id: string; name: string; avatar: string | null } | null;
  city: { id: string; name: string; timezone: string } | null;
  partnerOnGame: 'none' | 'invited' | 'playing' | 'queued' | 'other';
};

export type AddUserTeamToGameResult = {
  gameId: string;
  invitedUserIds: string[];
  taggedUserIds: string[];
  pairSeated: boolean;
};

export const userTeamsApi = {
  getMine: async (): Promise<UserTeam[]> => {
    const res = await api.get<ApiResponse<UserTeam[]>>('/user-teams');
    return res.data.data;
  },

  getMemberships: async (): Promise<UserTeamMembership[]> => {
    const res = await api.get<ApiResponse<UserTeamMembership[]>>('/user-teams/memberships');
    return res.data.data;
  },

  getForPlayerInvite: async (opts?: { gameId?: string; sport?: string }): Promise<UserTeam[]> => {
    const params = new URLSearchParams();
    if (opts?.gameId) params.set('gameId', opts.gameId);
    if (opts?.sport) params.set('sport', opts.sport);
    const qs = params.toString();
    const res = await api.get<ApiResponse<UserTeam[]>>(`/user-teams/for-player-invite${qs ? `?${qs}` : ''}`);
    return res.data.data;
  },

  getById: async (id: string): Promise<UserTeam> => {
    const res = await api.get<ApiResponse<UserTeam>>(`/user-teams/${id}`);
    return res.data.data;
  },

  create: async (data?: {
    name?: string;
    verbalStatus?: string | null;
    avatar?: string | null;
    originalAvatar?: string | null;
  }): Promise<UserTeam> => {
    const res = await api.post<ApiResponse<UserTeam>>('/user-teams', data ?? {});
    return res.data.data;
  },

  update: async (
    id: string,
    data: {
      name?: string;
      verbalStatus?: string | null;
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

  getInvitableGames: async (teamId: string): Promise<UserTeamInvitableGame[]> => {
    const res = await api.get<ApiResponse<UserTeamInvitableGame[]>>(`/user-teams/${teamId}/invitable-games`);
    return res.data.data;
  },

  addToGame: async (teamId: string, gameId: string): Promise<AddUserTeamToGameResult> => {
    const res = await api.post<ApiResponse<AddUserTeamToGameResult>>(`/user-teams/${teamId}/add-to-game`, { gameId });
    return res.data.data;
  },
};
