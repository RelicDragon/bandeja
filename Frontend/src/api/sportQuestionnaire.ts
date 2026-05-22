import api from './axios';
import type { ApiResponse } from '@/types';
import type { Sport, User } from '@/types';
import { isAxiosError } from 'axios';

export type QuestionnaireStatus = {
  completed: boolean;
  skipped: boolean;
  suggested: boolean;
  level: number;
  gamesPlayed: number;
};

export const sportQuestionnaireApi = {
  getStatus: async (sport: Sport): Promise<QuestionnaireStatus | null> => {
    try {
      const response = await api.get<ApiResponse<QuestionnaireStatus>>(
        `/users/me/sports/${sport}/questionnaire/status`,
      );
      return response.data.data ?? null;
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 404) {
        return null;
      }
      throw err;
    }
  },

  complete: async (sport: Sport, answers: string[]) => {
    const response = await api.post<ApiResponse<User>>(
      `/users/me/sports/${sport}/questionnaire`,
      { answers },
    );
    return response.data;
  },

  skip: async (sport: Sport) => {
    const response = await api.post<ApiResponse<User>>(
      `/users/me/sports/${sport}/questionnaire/skip`,
    );
    return response.data;
  },
};
