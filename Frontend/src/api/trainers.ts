import api from './axios';
import { ApiResponse } from '@/types';
import type { TrainerReview, TrainerReviewSummary } from '@/types';

export interface TrainerReviewsResponse {
  summary: TrainerReviewSummary | null;
  reviews: TrainerReview[];
  total: number;
  page: number;
  limit: number;
}

export const trainersApi = {
  getReviews: async (
    trainerId: string,
    params?: { page?: number; limit?: number; withTextOnly?: boolean }
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.page != null) searchParams.set('page', String(params.page));
    if (params?.limit != null) searchParams.set('limit', String(params.limit));
    if (params?.withTextOnly) searchParams.set('withTextOnly', 'true');
    const q = searchParams.toString();
    const response = await api.get<ApiResponse<TrainerReviewsResponse>>(
      `/trainers/${trainerId}/reviews${q ? `?${q}` : ''}`
    );
    return response.data;
  },
};
