import api from './axios';
import { ApiResponse, User } from '@/types';

export interface LeaderboardEntry extends User {
  rank: number;
  levelName: string;
  winRate: string;
  reliability: number;
  totalPoints: number;
  gamesPlayed: number;
  gamesWon: number;
  lastGameRatingChange?: number | null;
  gamesCount?: number;
}

export interface UserLeaderboardContext {
  leaderboard: LeaderboardEntry[];
  userRank: number;
}

export const rankingApi = {
  getUserLeaderboardContext: async (type: 'level' | 'social' | 'games' = 'level', scope: 'city' | 'global' = 'global', timePeriod?: '10' | '30' | 'all') => {
    const response = await api.get<ApiResponse<UserLeaderboardContext>>('/rankings/user-context', {
      params: { type, scope, timePeriod },
    });
    return response.data;
  },
};

