import { isAxiosError } from 'axios';
import api from './axios';
import { ApiResponse, Game, GameTeam, GameTeamData, BookedCourtSlot } from '@/types';
import type { LinkBookingToGameBody } from '@shared/gameBooking/contracts';
import type { ReactionEmojiUsageMutationPayload } from '@/store/reactionEmojiUsageStore';
import { normalizeGameResultsArtifacts } from '@/utils/gameResultsArtifacts.util';
import { getGameMainPhotoId } from '@/utils/gameMainPhoto';

export function normalizeGameFromApi(game: Game): Game {
  const artifacts = normalizeGameResultsArtifacts(game.resultsArtifacts);
  const mainPhotoId = getGameMainPhotoId(game);
  return {
    ...game,
    ...(mainPhotoId !== undefined ? { mainPhotoId } : {}),
    ...(artifacts ? { resultsArtifacts: artifacts } : {}),
    resultsSummaryText:
      typeof game.resultsSummaryText === 'string' ? game.resultsSummaryText : game.resultsSummaryText ?? null,
  };
}

function mapGamesPayload<T extends Game | Game[] | undefined>(data: T): T {
  if (!data) return data;
  if (Array.isArray(data)) return data.map(normalizeGameFromApi) as T;
  return normalizeGameFromApi(data) as T;
}

function mapApiGameResponse<T extends { data?: Game | Game[] }>(payload: T): T {
  if (!payload.data) return payload;
  return { ...payload, data: mapGamesPayload(payload.data) };
}

export type WorkoutSessionSource = 'APPLE_WATCH' | 'ANDROID_HEALTH_CONNECT';

export interface GameWorkoutSummary {
  id: string;
  gameId: string;
  userId: string;
  source: WorkoutSessionSource;
  durationSeconds: number;
  totalEnergyKcal: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  startedAt: string;
  endedAt: string;
  healthExternalId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const gamesApi = {
  getAll: async (params?: {
    cityId?: string;
    startDate?: string;
    startDateBefore?: string;
    endDate?: string;
    minLevel?: number;
    maxLevel?: number;
    gameType?: string;
    isPublic?: boolean;
    status?: string;
    participantUserId?: string;
    parentId?: string;
    entityType?: string;
    limit?: number;
    offset?: number;
  }) => {
    const response = await api.get<ApiResponse<Game[]>>('/games', { params });
    return response.data;
  },

  getMyGames: async () => {
    const response = await api.get<ApiResponse<Game[]>>('/games/my-games');
    return response.data;
  },

  getMyGamesWithUnread: async () => {
    const response = await api.get<
      ApiResponse<{ games: Game[]; invites: any[]; gamesUnreadCounts: Record<string, number> }>
    >('/games/my-games-with-unread');
    return response.data;
  },

  getPastGames: async (params?: { limit?: number; offset?: number; startDate?: string; endDate?: string }) => {
    const response = await api.get<ApiResponse<Game[]>>('/games/past-games', { params });
    return response.data;
  },

  getAvailableUpcomingGames: async (params?: { includeLeagues?: boolean; sport?: string; showPrivateGames?: boolean }) => {
    const response = await api.get<ApiResponse<Game[]>>('/games/available/upcoming', { params });
    return response.data;
  },

  getAvailableGames: async (params?: { month?: number; year?: number; startDate?: string; endDate?: string; showArchived?: boolean; includeLeagues?: boolean; sport?: string; showPrivateGames?: boolean }) => {
    const response = await api.get<ApiResponse<Game[]>>('/games/available', { params });
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<ApiResponse<Game>>(`/games/${id}`);
    return mapApiGameResponse(response.data);
  },

  create: async (data: Partial<Game>) => {
    const response = await api.post<ApiResponse<Game>>('/games', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Game>) => {
    const response = await api.put<ApiResponse<Game>>(`/games/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete<ApiResponse<void>>(`/games/${id}`);
    return response.data;
  },

  addReaction: async (gameId: string, emoji: string) => {
    const response = await api.post<
      ApiResponse<{
        reactions: Array<{ userId: string; emoji: string }>;
        emojiUsage: ReactionEmojiUsageMutationPayload;
      }>
    >(`/games/${gameId}/reactions`, { emoji });
    return response.data;
  },

  removeReaction: async (gameId: string) => {
    const response = await api.delete<ApiResponse<{ reactions: Array<{ userId: string; emoji: string }> }>>(
      `/games/${gameId}/reactions`
    );
    return response.data;
  },

  join: async (id: string) => {
    const response = await api.post<ApiResponse<Game>>(`/games/${id}/join`);
    return response.data;
  },

  joinAsGuest: async (id: string) => {
    const response = await api.post<ApiResponse<Game>>(`/games/${id}/join-as-guest`);
    return response.data;
  },

  leaveChat: async (id: string) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/leave-chat`);
    return response.data;
  },

  togglePlayingStatus: async (id: string, status: 'PLAYING' | 'IN_QUEUE') => {
    const response = await api.put<ApiResponse<Game>>(`/games/${id}/toggle-playing-status`, { status });
    return response.data;
  },

  leave: async (id: string) => {
    const response = await api.post<ApiResponse<Game>>(`/games/${id}/leave`);
    return response.data;
  },

  submitResults: async (id: string, results: any) => {
    const response = await api.post<ApiResponse<Game>>(`/game-results/${id}`, results);
    return response.data;
  },

  updateResults: async (id: string, results: any) => {
    const response = await api.put<ApiResponse<Game>>(`/game-results/${id}`, results);
    return response.data;
  },

  getResults: async (id: string) => {
    const response = await api.get<ApiResponse<any>>(`/game-results/${id}`);
    return response.data;
  },

  promoteToAdmin: async (id: string, userId: string) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/add-admin`, { userId });
    return response.data;
  },

  revokeAdmin: async (id: string, userId: string) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/revoke-admin`, { userId });
    return response.data;
  },

  setTrainer: async (id: string, userId: string, isTrainer: boolean) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/set-trainer`, { userId, isTrainer });
    return response.data;
  },

  kickUser: async (id: string, userId: string) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/kick-user`, { userId });
    return response.data;
  },

  transferOwnership: async (id: string, userId: string) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/transfer-ownership`, { userId });
    return response.data;
  },

  // Fixed Teams API
  getFixedTeams: async (id: string) => {
    const response = await api.get<ApiResponse<GameTeam[]>>(`/game-teams/game/${id}/teams`);
    return response.data;
  },

  setFixedTeams: async (id: string, teams: GameTeamData[]) => {
    const response = await api.post<ApiResponse<Game>>(`/game-teams/game/${id}/teams`, { teams });
    return response.data;
  },

  deleteFixedTeams: async (id: string) => {
    const response = await api.delete<ApiResponse<void>>(`/game-teams/game/${id}/teams`);
    return response.data;
  },

  acceptJoinQueue: async (id: string, userId: string) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/accept-join-queue`, { userId });
    return response.data;
  },

  declineJoinQueue: async (id: string, userId: string) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/decline-join-queue`, { userId });
    return response.data;
  },

  cancelJoinQueue: async (id: string) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/cancel-join-queue`);
    return response.data;
  },

  assignLeagueParticipants: async (id: string, playerIds: string[]) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/assign-league-participants`, { playerIds });
    return response.data;
  },

  getBookedCourts: async (params: {
    clubId: string;
    startDate?: string;
    endDate?: string;
    courtId?: string;
  }) => {
    const response = await api.get<ApiResponse<BookedCourtSlot[]> & { isLoadingExternalSlots?: boolean }>('/games/booked-courts', { params });
    return response.data;
  },

  prepareResultsArtifactSummary: async (id: string) => {
    const response = await api.post<
      ApiResponse<{
        resultsArtifacts: Game['resultsArtifacts'];
        resultsSummaryText: string | null;
        photosCount?: number;
        mainPhotoId?: string | null;
      }>
    >(`/games/${id}/prepare-results-artifacts/summary`);
    return response.data;
  },

  prepareResultsArtifactPhoto: async (id: string) => {
    const response = await api.post<
      ApiResponse<{
        resultsArtifacts: Game['resultsArtifacts'];
        resultsSummaryText: string | null;
        photosCount?: number;
        mainPhotoId?: string | null;
      }>
    >(`/games/${id}/prepare-results-artifacts/photo`);
    return response.data;
  },

  getResultsArtifactsStatus: async (id: string) => {
    const response = await api.get<
      ApiResponse<{
        artifacts: NonNullable<Game['resultsArtifacts']>;
        resultsSummaryText: string | null;
      }>
    >(`/games/${id}/results-artifacts-status`);
    return response.data;
  },

  prepareTelegramSummary: async (id: string, options?: { regenerate?: boolean }) => {
    const response = await api.get<ApiResponse<{ summary: string }>>(`/games/${id}/prepare-telegram-summary`, {
      timeout: 20000,
      params: options?.regenerate ? { regenerate: 'true' } : undefined,
    });
    return response.data;
  },

  sendResultsToTelegram: async (id: string, summaryText: string) => {
    const response = await api.post<ApiResponse<void>>(`/games/${id}/send-results-to-telegram`, 
      { summaryText }
    );
    return response.data;
  },

  resetTelegramResultsSent: async (id: string) => {
    const response = await api.patch<ApiResponse<void>>(`/games/${id}/reset-telegram-results-sent`);
    return response.data;
  },

  upsertWorkoutSummary: async (
    gameId: string,
    body: {
      durationSeconds: number;
      totalEnergyKcal?: number | null;
      avgHeartRate?: number | null;
      maxHeartRate?: number | null;
      startedAt: string;
      endedAt: string;
      source?: WorkoutSessionSource;
      healthExternalId?: string | null;
    }
  ) => {
    const response = await api.post<ApiResponse<GameWorkoutSummary>>(`/games/${gameId}/workout`, body);
    return response.data;
  },

  patchBookings: async (
    id: string,
    body: { add?: string[]; remove?: string[] },
  ) => {
    const response = await api.patch<ApiResponse<Game>>(`/games/${id}/bookings`, body);
    return mapApiGameResponse(response.data);
  },

  putBookingSnapshots: async (
    id: string,
    body: { snapshots: Array<{ externalBookingId: string; courtId?: string; bookingStart?: string; bookingEnd?: string }> },
  ) => {
    const response = await api.put<ApiResponse<Game>>(`/games/${id}/booking-snapshots`, body);
    return mapApiGameResponse(response.data);
  },

  linkBooking: async (id: string, body: LinkBookingToGameBody) => {
    const response = await api.post<ApiResponse<Array<{
      id: string;
      externalBookingId: string;
      externalBookingProvider: string;
      courtId?: string;
      bookingStart?: string;
      bookingEnd?: string;
    }>>>(`/games/${id}/link-booking`, body);
    return response.data;
  },

  getMyWorkoutForGame: async (gameId: string) => {
    try {
      const response = await api.get<ApiResponse<GameWorkoutSummary | null>>(`/games/${gameId}/workout/me`);
      return response.data;
    } catch (err) {
      if (isAxiosError(err)) {
        const status = err.response?.status;
        // No row / not a workout participant / route missing on old backends → treat as empty
        if (status === 404 || status === 403) {
          return { success: true, data: null };
        }
        // Archived games were blocked by canAccessGame (400) before canAccessGameIncludingArchived
        if (status === 400) {
          return { success: true, data: null };
        }
      }
      throw err;
    }
  },

  enableParticipantChats: async (gameId: string) => {
    const response = await api.post<
      ApiResponse<{ privateEnabled: boolean; adminsEnabled: boolean; created: boolean }>
    >(`/games/${gameId}/enable-participant-chats`);
    return response.data;
  },
};

