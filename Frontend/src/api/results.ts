import api from './axios';
import { ApiResponse } from '@/types';
import { BatchOpsResponse } from '@/types/ops';

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

export interface BatchOpsRequest {
  ops: Array<{
    id: string;
    base_version: number;
    op: 'replace' | 'add' | 'remove';
    path: string;
    value?: any;
    actor: { userId: string };
  }>;
}

export const resultsApi = {
  recalculateOutcomes: async (gameId: string) => {
    const response = await api.post<ApiResponse<any>>(`/results/game/${gameId}/recalculate`);
    return response.data;
  },

  editGameResults: async (gameId: string, baseVersion?: number) => {
    const response = await api.post<ApiResponse<void>>(`/results/game/${gameId}/edit`, {
      baseVersion,
    });
    return response.data;
  },

  deleteGameResults: async (gameId: string, baseVersion?: number) => {
    const response = await api.delete<ApiResponse<void>>(`/results/game/${gameId}`, {
      data: {
        baseVersion,
      },
    });
    return response.data;
  },

  getGameResults: async (gameId: string) => {
    const response = await api.get<ApiResponse<any>>(`/results/game/${gameId}`);
    return response.data;
  },

  batchOps: async (gameId: string, batchId: string, data: BatchOpsRequest) => {
    const response = await api.post<ApiResponse<BatchOpsResponse>>(
      `/results/game/${gameId}/ops:batch`,
      data,
      {
        headers: {
          'X-Idempotency-Key': batchId,
        },
      }
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
}

export interface MatchExplanation {
  matchNumber: number;
  roundNumber: number;
  isWinner: boolean;
  opponentLevel: number;
  levelDifference: number;
  scoreDelta?: number;
  levelChange: number;
  reliabilityChange: number;
  pointsEarned: number;
  multiplier?: number;
  totalPointDifferential?: number;
  teammates: Array<{ firstName?: string; lastName?: string; level: number }>;
  opponents: Array<{ firstName?: string; lastName?: string; level: number }>;
  sets?: SetExplanation[];
}

export const getOutcomeExplanation = async (gameId: string, userId: string): Promise<OutcomeExplanation> => {
  const response = await api.get<ApiResponse<OutcomeExplanation>>(`/results/game/${gameId}/outcome/${userId}/explanation`);
  return response.data.data;
};

