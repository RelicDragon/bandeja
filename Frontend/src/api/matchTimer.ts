import api from './axios';
import type { ApiResponse } from '@/types';
import type { MatchTimerAction, MatchTimerSnapshot } from '@/utils/matchTimer';

export const matchTimerApi = {
  getSnapshot: async (gameId: string, matchId: string) => {
    const res = await api.get<ApiResponse<{ snapshot: MatchTimerSnapshot }>>(
      `/results/game/${gameId}/matches/${matchId}/timer`
    );
    return res.data;
  },

  transition: async (gameId: string, matchId: string, action: MatchTimerAction) => {
    const path = `/results/game/${gameId}/matches/${matchId}/timer/${action}`;
    const res = await api.post<ApiResponse<{ snapshot: MatchTimerSnapshot }>>(path, {});
    return res.data;
  },
};
