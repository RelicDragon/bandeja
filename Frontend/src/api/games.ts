import api from './axios';
import { ApiResponse, Game, GameTeam, GameTeamData } from '@/types';

export const gamesApi = {
  getAll: async (params?: {
    cityId?: string;
    startDate?: string;
    startDateBefore?: string;
    endDate?: string;
    minLevel?: number;
    maxLevel?: number;
    gameType?: string;
    isPublic?: boolean;
    status?: string;
    participantUserId?: string;
    limit?: number;
    offset?: number;
  }) => {
    const response = await api.get<ApiResponse<Game[]>>('/games', { params });
    return response.data;
  },

  getMyGames: async () => {
    const response = await api.get<ApiResponse<Game[]>>('/games/my-games');
    return response.data;
  },

  getPastGames: async (params?: { limit?: number; offset?: number }) => {
    const response = await api.get<ApiResponse<Game[]>>('/games/past-games', { params });
    return response.data;
  },

  getAvailableGames: async (params?: { month?: number; year?: number; startDate?: string; endDate?: string }) => {
    const response = await api.get<ApiResponse<Game[]>>('/games/available', { params });
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<Game>>(`/games/${id}`);
    return response.data;
  },

  create: async (data: Partial<Game>) => {
    const response = await api.post<ApiResponse<Game>>('/games', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Game>) => {
    const response = await api.put<ApiResponse<Game>>(`/games/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete<ApiResponse<void>>(`/games/${id}`);
    return response.data;
  },

  join: async (id: string) => {
    const response = await api.post<ApiResponse<Game>>(`/games/${id}/join`);
    return response.data;
  },

  joinAsGuest: async (id: string) => {
    const response = await api.post<ApiResponse<Game>>(`/games/${id}/join-as-guest`);
    return response.data;
  },

  togglePlayingStatus: async (id: string, isPlaying: boolean) => {
    const response = await api.put<ApiResponse<Game>>(`/games/${id}/toggle-playing-status`, { isPlaying });
    return response.data;
  },

  leave: async (id: string) => {
    const response = await api.post<ApiResponse<Game>>(`/games/${id}/leave`);
    return response.data;
  },

  submitResults: async (id: string, results: any) => {
    const response = await api.post<ApiResponse<Game>>(`/game-results/${id}`, results);
    return response.data;
  },

  updateResults: async (id: string, results: any) => {
    const response = await api.put<ApiResponse<Game>>(`/game-results/${id}`, results);
    return response.data;
  },

  getResults: async (id: string) => {
    const response = await api.get<ApiResponse<any>>(`/game-results/${id}`);
    return response.data;
  },

  promoteToAdmin: async (id: string, userId: string) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/add-admin`, { userId });
    return response.data;
  },

  revokeAdmin: async (id: string, userId: string) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/revoke-admin`, { userId });
    return response.data;
  },

  kickUser: async (id: string, userId: string) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/kick-user`, { userId });
    return response.data;
  },

  transferOwnership: async (id: string, userId: string) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/transfer-ownership`, { userId });
    return response.data;
  },

  // Fixed Teams API
  getFixedTeams: async (id: string) => {
    const response = await api.get<ApiResponse<GameTeam[]>>(`/game-teams/game/${id}/teams`);
    return response.data;
  },

  setFixedTeams: async (id: string, teams: GameTeamData[]) => {
    const response = await api.post<ApiResponse<Game>>(`/game-teams/game/${id}/teams`, { teams });
    return response.data;
  },

  deleteFixedTeams: async (id: string) => {
    const response = await api.delete<ApiResponse<void>>(`/game-teams/game/${id}/teams`);
    return response.data;
  },

  acceptJoinQueue: async (id: string, userId: string) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/accept-join-queue`, { userId });
    return response.data;
  },

  declineJoinQueue: async (id: string, userId: string) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/decline-join-queue`, { userId });
    return response.data;
  }
};

