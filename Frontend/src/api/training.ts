import api from './axios';
import { ApiResponse } from '@/types';

export const trainingApi = {
  finishTraining: async (gameId: string) => {
    const response = await api.post<ApiResponse<void>>(`/training/${gameId}/finish`);
    return response.data;
  },

  updateParticipantLevel: async (
    gameId: string,
    userId: string,
    level: number,
    reliability: number
  ) => {
    const response = await api.post<ApiResponse<void>>(`/training/${gameId}/participant/${userId}/level`, {
      level,
      reliability,
    });
    return response.data;
  },

  undoTraining: async (gameId: string) => {
    const response = await api.post<ApiResponse<void>>(`/training/${gameId}/undo`);
    return response.data;
  },
};
