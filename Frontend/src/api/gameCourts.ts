import api from './axios';
import { ApiResponse, Court } from '@/types';

export interface GameCourt {
  id: string;
  gameId: string;
  courtId: string;
  order: number;
  court: Court;
  createdAt: string;
  updatedAt: string;
}

export const gameCourtsApi = {
  getByGameId: async (gameId: string) => {
    const response = await api.get<ApiResponse<GameCourt[]>>(`/game-courts/game/${gameId}`);
    return response.data;
  },

  setGameCourts: async (gameId: string, courtIds: string[]) => {
    const response = await api.post<ApiResponse<GameCourt[]>>(`/game-courts/game/${gameId}`, { courtIds });
    return response.data;
  },

  addGameCourt: async (gameId: string, courtId: string) => {
    const response = await api.post<ApiResponse<GameCourt>>(`/game-courts/game/${gameId}/add`, { courtId });
    return response.data;
  },

  removeGameCourt: async (gameId: string, gameCourtId: string) => {
    const response = await api.delete<ApiResponse<void>>(`/game-courts/game/${gameId}/${gameCourtId}`);
    return response.data;
  },

  reorderGameCourts: async (gameId: string, gameCourtIds: string[]) => {
    const response = await api.put<ApiResponse<GameCourt[]>>(`/game-courts/game/${gameId}/reorder`, { gameCourtIds });
    return response.data;
  },
};

