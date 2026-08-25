import api from './axios';
import type { ApiResponse, BasicUser, Sport, User } from '@/types';
import type { LeaderboardGenderFilter } from '@/components/leaderboard/leaderboardGender';
import type { AchievementLeaderboardFamily } from '@shared/achievements';

export interface LeaderboardEntry extends User {
  rank: number | null;
  levelName: string;
  winRate: string;
  reliability: number;
  totalPoints: number;
  gamesPlayed: number;
  gamesWon: number;
  lastGameRatingChange?: number | null;
  gamesCount?: number;
  inactive?: boolean;
}

export interface UserLeaderboardContext {
  leaderboard: LeaderboardEntry[];
  userRank: number | null;
}

export interface AchievementLeaderboardEntry extends BasicUser {
  progress: number;
  rank: number;
}

export interface AchievementLeaderboardContext {
  leaderboard: AchievementLeaderboardEntry[];
  viewerEntry: AchievementLeaderboardEntry | null;
  total: number;
  limit: number;
  isTruncated: boolean;
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

  getAchievementLeaderboardContext: async (
    family: AchievementLeaderboardFamily,
    scope: 'city' | 'global' = 'global',
    gender: LeaderboardGenderParam = 'all',
  ) => {
    const response = await api.get<ApiResponse<AchievementLeaderboardContext>>(
      '/rankings/achievement-context',
      { params: { family, scope, gender } },
    );
    return response.data.data;
  },
};
