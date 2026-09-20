import api from './axios';
import type { ApiResponse, Sport } from '@/types';

/** PRD 352 — the pair leaderboard, the pair sheet and Profile → Your partners. */

export type PairPeriod = '10' | '30' | 'all';
export type PairSort = 'winRate' | 'games' | 'level';

export const PAIR_SORTS: readonly PairSort[] = ['winRate', 'games', 'level'];

export interface PairMember {
  id: string;
  firstName: string;
  lastName: string | null;
  avatar: string | null;
  isPremium: boolean;
  showPremiumStatus: boolean;
  level: number | null;
}

export interface PairEntry {
  /** The `?pair=a,b` overlay value — always `userAId < userBId`. */
  pairId: string;
  rank: number;
  userA: PairMember;
  userB: PairMember;
  games: number;
  wins: number;
  /** 0–100, one decimal. */
  winRate: number;
  combinedLevel: number | null;
  /** Percentage points above the members' mean solo win rate; `null` = unknown. */
  chemistry: number | null;
  lastPlayedAt: string | null;
  isViewerPair: boolean;
  /** Existing two-person `UserTeam`, when the pair already formalized one. */
  teamId: string | null;
}

export interface PairLeaderboardPage {
  pairs: PairEntry[];
  nextCursor: string | null;
  total: number;
  me: { rank: number; pairId: string } | null;
}

export interface PairRecentGame {
  id: string;
  name: string | null;
  entityType: string;
  sport: Sport;
  startTime: string;
  clubName: string | null;
  won: boolean;
}

export type PairDetail = Omit<PairEntry, 'rank'> & {
  recentGames: PairRecentGame[];
};

export interface PartnerEntry {
  pairId: string;
  partner: PairMember;
  games: number;
  wins: number;
  winRate: number;
  chemistry: number | null;
  lastPlayedAt: string | null;
  teamId: string | null;
}

export interface PairLeaderboardParams {
  cityId?: string;
  sport?: Sport;
  period?: PairPeriod;
  sort?: PairSort;
  cursor?: string;
  limit?: number;
}

export const pairsApi = {
  getLeaderboard: async (params: PairLeaderboardParams): Promise<PairLeaderboardPage> => {
    const response = await api.get<ApiResponse<PairLeaderboardPage>>('/rankings/pairs', { params });
    return response.data.data;
  },

  getPair: async (pairId: string, sport?: Sport): Promise<PairDetail> => {
    const response = await api.get<ApiResponse<PairDetail>>(
      `/rankings/pairs/${encodeURIComponent(pairId)}`,
      { params: sport ? { sport } : undefined },
    );
    return response.data.data;
  },

  getPartners: async (userId: string, sport?: Sport): Promise<PartnerEntry[]> => {
    const response = await api.get<ApiResponse<{ partners: PartnerEntry[] }>>(
      `/users/${userId}/partners`,
      { params: sport ? { sport } : undefined },
    );
    return response.data.data.partners;
  },
};
