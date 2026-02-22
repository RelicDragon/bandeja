import api from './axios';
import { ApiResponse } from '@/types';
import type { TrainerReview, TrainerReviewSummary } from '@/types';

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

  submitReview: async (gameId: string, stars: number, text?: string) => {
    const response = await api.post<ApiResponse<{ review: TrainerReview; summary: TrainerReviewSummary }>>(
      `/training/${gameId}/review`,
      { stars, text: text || undefined }
    );
    return response.data;
  },

  getMyReview: async (gameId: string) => {
    const response = await api.get<ApiResponse<TrainerReview | null>>(`/training/${gameId}/my-review`);
    return response.data;
  },
};
