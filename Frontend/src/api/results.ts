import api from './axios';
import { resolveAbsoluteApiBaseUrlForFetch } from '@/api/apiBaseUrl';
import { ApiResponse, Game } from '@/types';
import { Round } from '@/types/gameResults';
import type { MatchLiveScoringEnvelopeV1 } from '@/types/matchLiveScoring';

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
    isTieBreak?: boolean;
    role?: string;
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

export type PlayerLevelVerdict = 'LOWER' | 'ABOUT_RIGHT' | 'HIGHER';

export interface GameLevelEvaluationPlayer {
  user: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    avatar?: string | null;
    originalAvatar?: string | null;
  };
  levelSnapshot: number;
  verdict: PlayerLevelVerdict | null;
  updatedAt: string | null;
}

export interface GameLevelEvaluations {
  sport: string;
  canEdit: boolean;
  editableUntil: string;
  completedCount: number;
  players: GameLevelEvaluationPlayer[];
}

const RESULTS_BATCH_MAX = 50;
const RESULTS_BATCH_WINDOW_MS = 16;
type ResultsWaiter = { resolve: (value: ApiResponse<any>) => void; reject: (error: unknown) => void };
const pendingResults = new Map<string, ResultsWaiter[]>();
let resultsBatchTimer: ReturnType<typeof setTimeout> | null = null;
/** Flipped off when the server predates `/results/games` (404). */
let resultsBatchSupported = true;

function enqueueGameResults(gameId: string): Promise<ApiResponse<any>> {
  if (!resultsBatchSupported) return resultsApi.getGameResults(gameId);
  return new Promise((resolve, reject) => {
    const waiters = pendingResults.get(gameId);
    if (waiters) waiters.push({ resolve, reject });
    else pendingResults.set(gameId, [{ resolve, reject }]);
    if (pendingResults.size >= RESULTS_BATCH_MAX) flushGameResults();
    else if (!resultsBatchTimer) resultsBatchTimer = setTimeout(flushGameResults, RESULTS_BATCH_WINDOW_MS);
  });
}

function flushGameResults(): void {
  if (resultsBatchTimer) {
    clearTimeout(resultsBatchTimer);
    resultsBatchTimer = null;
  }
  const batch = new Map(pendingResults);
  pendingResults.clear();
  if (batch.size === 0) return;
  const ids = [...batch.keys()];
  const settle = (gameId: string, run: (waiter: ResultsWaiter) => void) => batch.get(gameId)?.forEach(run);

  void api
    .get<ApiResponse<Record<string, { data?: unknown; error?: { status: number } }>>>('/results/games', {
      params: { ids: ids.join(',') },
    })
    .then((response) => {
      const byId = response.data.data ?? {};
      for (const gameId of ids) {
        const entry = byId[gameId];
        if (entry && 'data' in entry) {
          settle(gameId, (w) => w.resolve({ success: true, data: entry.data } as ApiResponse<any>));
        } else {
          const error = new Error(`results unavailable (${entry?.error?.status ?? 'missing'})`);
          settle(gameId, (w) => w.reject(error));
        }
      }
    })
    .catch((error: { response?: { status?: number } }) => {
      if (error?.response?.status === 404) {
        resultsBatchSupported = false;
        for (const gameId of ids) {
          settle(gameId, (w) => {
            resultsApi.getGameResults(gameId).then(w.resolve, w.reject);
          });
        }
        return;
      }
      for (const gameId of ids) settle(gameId, (w) => w.reject(error));
    });
}

export const resultsApi = {
  getLevelEvaluations: async (gameId: string) => {
    const response = await api.get<ApiResponse<GameLevelEvaluations>>(
      `/results/game/${gameId}/level-evaluations`,
    );
    return response.data;
  },

  upsertLevelEvaluation: async (
    gameId: string,
    targetUserId: string,
    verdict: PlayerLevelVerdict,
  ) => {
    const response = await api.put<ApiResponse<{
      targetUserId: string;
      verdict: PlayerLevelVerdict;
      levelSnapshot: number;
      updatedAt: string;
    }>>(`/results/game/${gameId}/level-evaluations/${targetUserId}`, { verdict });
    return response.data;
  },

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
  /**
   * Same payload as `getGameResults`, but calls made within a few ms are sent as one
   * `GET /results/games?ids=` (league schedules mount one results card per fixture).
   */
  getGameResultsBatched: (gameId: string): Promise<ApiResponse<any>> => enqueueGameResults(gameId),

  syncResults: async (gameId: string, rounds: Round[], baseVersion?: string | null) => {
    const response = await api.post<ApiResponse<any>>(`/results/game/${gameId}/sync`, {
      rounds, baseVersion,
    });
    return response.data;
  },

  generateRound: async (gameId: string) => {
    const response = await api.post<ApiResponse<{ round: unknown }>>(
      `/results/game/${gameId}/rounds/generate`,
      {}
    );
    return response.data;
  },

  startResultsEntryWithGeneratedRound: async (gameId: string) => {
    const response = await api.post<ApiResponse<{ game: Game; round: unknown | null; alreadyHadRounds: boolean }>>(
      `/results/game/${gameId}/start-results-entry`,
      {}
    );
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

  deleteMatch: async (gameId: string, matchId: string) => {
    const response = await api.delete<ApiResponse<void>>(`/results/game/${gameId}/matches/${matchId}`);
    return response.data;
  },

  updateMatch: async (gameId: string, matchId: string, match: {
    teamA: string[];
    teamB: string[];
    sets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean; role?: string }>;
    courtId?: string;
    metadata?: Record<string, unknown>;
    baseVersion?: string | null;
  }) => {
    const response = await api.put<ApiResponse<{ liveScoringCleared: boolean; resultsVersion: string }>>(
      `/results/game/${gameId}/matches/${matchId}`,
      match
    );
    return response.data;
  },

  patchMatchMetadata: async (gameId: string, matchId: string, patch: Record<string, unknown>, baseVersion: string) => {
    const response = await api.patch<ApiResponse<{ liveScoringCleared: boolean }>>(
      `/results/game/${gameId}/matches/${matchId}/metadata`,
      { patch, baseVersion }
    );
    return response.data;
  },

  patchMatchLiveScoring: async (
    gameId: string,
    matchId: string,
    body: {
      state: Record<string, unknown> | null;
      baseRevision: number | null;
      clientMessageId?: string;
      opId?: string;
    }
  ) => {
    const response = await api.patch<ApiResponse<{ liveScoring: MatchLiveScoringEnvelopeV1 | null; revision: number }>>(
      `/results/game/${gameId}/matches/${matchId}/live-scoring`,
      body
    );
    return response.data;
  },

  mintLiveSpectatorToken: async (gameId: string, matchId: string) => {
    const response = await api.post<ApiResponse<{ token: string }>>(
      `/results/game/${gameId}/matches/${matchId}/live-spectator-token`,
      {}
    );
    return response.data;
  },

  getGameResultsForSpectator: async (gameId: string, spectatorToken: string) => {
    const MAX_ST = 4096;
    if (spectatorToken.length > MAX_ST) {
      throw new Error('spectator token too long');
    }
    const base = resolveAbsoluteApiBaseUrlForFetch();
    const url = `${base}/results/game/${encodeURIComponent(gameId)}/spectator?st=${encodeURIComponent(spectatorToken)}`;
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`spectator ${res.status}`);
    }
    return (await res.json()) as ApiResponse<any>;
  },
};

export interface OutcomeExplanation {
  userId: string;
  userLevel: number;
  userReliability: number;
  userGamesPlayed: number;
  levelChange: number;
  reliabilityChange: number;
  reliabilityCoefficient: number;
  /** Accrued uncertainty used for reliability factor (admin only). */
  ratingUncertainty?: number;
  /** Soft public state when uncertainty ≥ threshold. */
  ratingSettling?: boolean;
  matches: MatchExplanation[];
  summary: {
    totalMatches: number;
    wins: number;
    losses: number;
    draws: number;
    averageOpponentLevel: number;
  };
  socialLevelChange?: {
    levelBefore: number;
    levelAfter: number;
    levelChange: number;
    baseBoost: number;
    roleMultiplier: number;
    roleName: string;
    participantBreakdown: Array<{
      participantId: string;
      participantName: string;
      gamesPlayedTogether: number;
      boost: number;
    }>;
  };
  placementRatingFloor?: {
    applied: boolean;
    uncappedLevelChange: number;
  };
}

export interface SetExplanation {
  setNumber: number;
  isWinner: boolean;
  levelChange: number;
  userScore: number;
  opponentScore: number;
  isTieBreak?: boolean;
  scoreKind?: 'GAMES' | 'AMERICANO_POINTS' | 'SUPER_TIEBREAK';
}

export interface MatchExplanation {
  matchNumber: number;
  roundNumber: number;
  isWinner: boolean;
  isDraw: boolean;
  notFinishedByRules?: boolean;
  opponentLevel: number;
  levelDifference: number;
  scoreDelta?: number;
  levelChange: number;
  pointsEarned: number;
  multiplier?: number;
  totalPointDifferential?: number;
  enduranceCoefficient?: number;
  teammates: Array<{ firstName?: string; lastName?: string; level: number }>;
  opponents: Array<{ firstName?: string; lastName?: string; level: number }>;
  sets?: SetExplanation[];
  automaticRecordMode?: 'GAMES' | 'AMERICANO_POINTS';
}

export const getOutcomeExplanation = async (gameId: string, userId: string): Promise<OutcomeExplanation> => {
  const response = await api.get<ApiResponse<OutcomeExplanation>>(`/results/game/${gameId}/outcome/${userId}/explanation`);
  return response.data.data;
};

export type RatingExplanationLlmStatus = 'pending' | 'ready' | 'failed' | 'skipped' | 'unavailable';

export interface RatingExplanationLlmResult {
  status: RatingExplanationLlmStatus;
  text?: string;
  language?: string;
  sourceLanguage?: string;
  kind?: 'original' | 'translation';
}

export const getOutcomeRatingExplanationLlm = async (
  gameId: string,
  userId: string,
  language: string,
  options?: { retry?: boolean },
): Promise<RatingExplanationLlmResult> => {
  const response = await api.get<ApiResponse<RatingExplanationLlmResult>>(
    `/results/game/${gameId}/outcome/${userId}/rating-explanation-llm`,
    {
      params: {
        lang: language,
        ...(options?.retry ? { retry: '1' } : {}),
      },
    },
  );
  return response.data.data;
};

export const getOutcomeRatingExplanationTranslation = async (
  gameId: string,
  userId: string,
  language: string,
  options?: { retry?: boolean },
): Promise<RatingExplanationLlmResult> => {
  const response = await api.get<ApiResponse<RatingExplanationLlmResult>>(
    `/results/game/${gameId}/outcome/${userId}/rating-explanation-llm/translation`,
    {
      params: {
        lang: language,
        ...(options?.retry ? { retry: '1' } : {}),
      },
    },
  );
  return response.data.data;
};
