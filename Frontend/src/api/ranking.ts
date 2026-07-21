import api from './axios';
import type { ApiResponse, Sport, User } from '@/types';
import type { LeaderboardGenderFilter } from '@/components/leaderboard/leaderboardGender';

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

export type LeaderboardGenderParam = LeaderboardGenderFilter;

export const rankingApi = {
  getUserLeaderboardContext: async (
    type: 'level' | 'social' | 'games' = 'level',
    scope: 'city' | 'global' = 'global',
    timePeriod?: '10' | '30' | 'all',
    sport?: Sport,
    gender: LeaderboardGenderParam = 'all',
  ) => {
    const response = await api.get<ApiResponse<UserLeaderboardContext>>('/rankings/user-context', {
      params: { type, scope, timePeriod, sport, gender },
    });
    return response.data;
  },
};

