import api from './axios';
import { ApiResponse } from '@/types';
import { Round } from '@/types/gameResults';

export interface RoundData {
  roundNumber: number;
  status?: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  matches: MatchData[];
  outcomes?: Array<{
    userId: string;
    levelChange: number;
  }>;
}

export interface MatchData {
  matchNumber: number;
  status?: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  winnerId?: string;
  teams: Array<{
    teamNumber: number;
    playerIds: string[];
    score?: number;
  }>;
  sets: Array<{
    setNumber: number;
    teamAScore: number;
    teamBScore: number;
  }>;
  courtId?: string;
}

export interface GameResultsData {
  rounds: RoundData[];
  finalOutcomes?: Array<{
    userId: string;
    levelChange: number;
    reliabilityChange: number;
    pointsEarned: number;
    position: number;
    isWinner?: boolean;
  }>;
}

export const resultsApi = {
  recalculateOutcomes: async (gameId: string) => {
    const response = await api.post<ApiResponse<any>>(`/results/game/${gameId}/recalculate`);
    return response.data;
  },

  editGameResults: async (gameId: string) => {
    const response = await api.post<ApiResponse<void>>(`/results/game/${gameId}/edit`);
    return response.data;
  },

  resetGameResults: async (gameId: string) => {
    const response = await api.post<ApiResponse<void>>(`/results/game/${gameId}/reset`);
    return response.data;
  },

  getGameResults: async (gameId: string) => {
    const response = await api.get<ApiResponse<any>>(`/results/game/${gameId}`);
    return response.data;
  },

  syncResults: async (gameId: string, rounds: Round[]) => {
    const response = await api.post<ApiResponse<void>>(`/results/game/${gameId}/sync`, {
      rounds,
    });
    return response.data;
  },

  createRound: async (gameId: string, round: { id: string }) => {
    const response = await api.post<ApiResponse<void>>(`/results/game/${gameId}/rounds`, round);
    return response.data;
  },

  deleteRound: async (gameId: string, roundId: string) => {
    const response = await api.delete<ApiResponse<void>>(`/results/game/${gameId}/rounds/${roundId}`);
    return response.data;
  },

  createMatch: async (gameId: string, roundId: string, match: { id: string }) => {
    const response = await api.post<ApiResponse<void>>(`/results/game/${gameId}/rounds/${roundId}/matches`, match);
    return response.data;
  },

  deleteMatch: async (gameId: string, roundId: string, matchId: string) => {
    const response = await api.delete<ApiResponse<void>>(`/results/game/${gameId}/rounds/${roundId}/matches/${matchId}`);
    return response.data;
  },

  updateMatch: async (gameId: string, roundId: string, matchId: string, match: {
    teamA: string[];
    teamB: string[];
    sets: Array<{ teamA: number; teamB: number }>;
    courtId?: string;
  }) => {
    const response = await api.put<ApiResponse<void>>(
      `/results/game/${gameId}/rounds/${roundId}/matches/${matchId}`,
      match
    );
    return response.data;
  },
};

export interface OutcomeExplanation {
  userId: string;
  userLevel: number;
  userReliability: number;
  userGamesPlayed: number;
  levelChange: number;
  reliabilityChange: number;
  matches: MatchExplanation[];
  summary: {
    totalMatches: number;
    wins: number;
    losses: number;
    draws: number;
    averageOpponentLevel: number;
  };
}

export interface SetExplanation {
  setNumber: number;
  isWinner: boolean;
  levelChange: number;
  userScore: number;
  opponentScore: number;
}

export interface MatchExplanation {
  matchNumber: number;
  roundNumber: number;
  isWinner: boolean;
  isDraw: boolean;
  opponentLevel: number;
  levelDifference: number;
  scoreDelta?: number;
  levelChange: number;
  reliabilityChange: number;
  pointsEarned: number;
  multiplier?: number;
  totalPointDifferential?: number;
  enduranceCoefficient?: number;
  teammates: Array<{ firstName?: string; lastName?: string; level: number }>;
  opponents: Array<{ firstName?: string; lastName?: string; level: number }>;
  sets?: SetExplanation[];
}

export const getOutcomeExplanation = async (gameId: string, userId: string): Promise<OutcomeExplanation> => {
  const response = await api.get<ApiResponse<OutcomeExplanation>>(`/results/game/${gameId}/outcome/${userId}/explanation`);
  return response.data.data;
};
