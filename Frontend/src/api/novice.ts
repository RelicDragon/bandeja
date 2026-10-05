import api from './axios';
import type { ApiResponse } from '@/types';

/** PRD 358 — mirrors `Backend/src/controllers/novice.controller.ts` (`GET /users/me/novice`). */
export interface NoviceState {
  noviceCountedGames: number;
  noviceRank: number;
  noviceMilestoneSeenRank: number;
  /** ISO timestamp once the user chose "show me everything", else `null`. */
  noviceUnlockedAllAt: string | null;
}

export const noviceApi = {
  get: async (): Promise<NoviceState> => {
    const response = await api.get<ApiResponse<NoviceState>>('/users/me/novice');
    return response.data.data;
  },

  /** Sets `noviceUnlockedAllAt` once (the first timestamp is kept). */
  unlockAll: async (): Promise<NoviceState> => {
    const response = await api.post<ApiResponse<NoviceState>>('/users/me/novice/unlock-all');
    return response.data.data;
  },

  /** `seen = max(seen, min(rank, noviceRank))` on the server. */
  markMilestoneSeen: async (rank: number): Promise<NoviceState> => {
    const response = await api.post<ApiResponse<NoviceState>>('/users/me/novice/milestone-seen', {
      rank,
    });
    return response.data.data;
  },
};
