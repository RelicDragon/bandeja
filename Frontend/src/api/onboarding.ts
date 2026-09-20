import api from './axios';
import type { ApiResponse, BasicUser } from '@/types';
import type { Sport } from '@shared/sport';
import type { OnboardingStep } from '@/components/onboarding/onboardingSteps';

/** Mirrors `Backend/src/services/onboarding/onboarding.service.ts#OnboardingState`. */
export interface OnboardingStatus {
  /** ISO timestamp, or `null` while the flow has never been finished. */
  completedAt: string | null;
  step: OnboardingStep | null;
  resumeStep: OnboardingStep;
  needsOnboarding: boolean;
  /** Completed, but the account still has no enabled sport. */
  needsSportStep: boolean;
}

export interface SuggestedUser {
  user: BasicUser;
  /** Finished games in the last 30 days — the number rendered on the row. */
  gamesThisMonth: number;
  /** Finished games in the 60-day ranking window. */
  gamesInWindow: number;
}

export interface CityStats {
  cityId: string;
  playerCount: number;
}

export const onboardingApi = {
  getStatus: async (): Promise<OnboardingStatus> => {
    const response = await api.get<ApiResponse<OnboardingStatus>>('/users/me/onboarding');
    return response.data.data;
  },

  setStep: async (step: OnboardingStep): Promise<OnboardingStatus> => {
    const response = await api.patch<ApiResponse<OnboardingStatus>>('/users/me/onboarding', {
      step,
    });
    return response.data.data;
  },

  complete: async (): Promise<OnboardingStatus> => {
    const response = await api.post<ApiResponse<OnboardingStatus>>(
      '/users/me/onboarding/complete',
    );
    return response.data.data;
  },

  getSuggestedUsers: async (params: {
    cityId?: string;
    sport?: Sport;
    limit?: number;
  }): Promise<SuggestedUser[]> => {
    const response = await api.get<ApiResponse<SuggestedUser[]>>('/users/suggested', { params });
    return response.data.data;
  },

  getCityStats: async (cityId: string): Promise<CityStats> => {
    const response = await api.get<ApiResponse<CityStats>>(`/cities/${cityId}/stats`);
    return response.data.data;
  },
};
