import api from './axios';
import { isAxiosError } from 'axios';
import { MAX_BASIC_USERS_BY_IDS } from '@/services/users/basicUsersBatchLimits';
import type { CommonChatItem } from './commonChats';
import {
  ApiResponse,
  User,
  BasicUser,
  EntityType,
  GameType,
  GameStatus,
  ParticipantRole,
  ParticipantStatus,
  Sport,
} from '@/types';
import type { GameWorkoutSummary } from './games';

export interface LevelHistoryItem {
  id: string;
  gameId?: string;
  levelBefore: number;
  levelAfter: number;
  levelChange: number;
  createdAt: string;
  sport?: Sport | null;
  eventType?: 'GAME' | 'LUNDA' | 'SET' | 'QUESTIONNAIRE' | 'OTHER' | 'SOCIAL_BAR' | 'SOCIAL_PARTICIPANT';
  linkEntityType?: EntityType | null;
  /** False when the linked game does not affect competitive level. */
  affectsRating?: boolean;
}

export type GamesStatType = '30' | '90' | 'all';

export interface GamesStat {
  type: GamesStatType;
  wins: number;
  ties: number;
  losses: number;
  totalMatches: number;
}

export type StreakResult = 'win' | 'loss' | 'tie';

export interface PerformanceRelationshipEntry {
  user: BasicUser;
  wins: number;
  losses: number;
  ties: number;
  totalMatches: number;
  winRate: string;
  ratingNetChange: number;
}

export interface UserPerformanceInsights {
  streaks: {
    recentGames: StreakResult[];
    current: {
      result: StreakResult;
      count: number;
    } | null;
    longestWin: number;
    longestLoss: number;
  };
  relationships: {
    bestPartner: PerformanceRelationshipEntry | null;
    worstPartner: PerformanceRelationshipEntry | null;
    bestPartnerByRating?: PerformanceRelationshipEntry | null;
    worstPartnerByRating?: PerformanceRelationshipEntry | null;
    bestPartnerByCount?: PerformanceRelationshipEntry | null;
    worstPartnerByCount?: PerformanceRelationshipEntry | null;
    favoriteTarget: PerformanceRelationshipEntry | null;
    nemesis: PerformanceRelationshipEntry | null;
    favoriteTargetByRating?: PerformanceRelationshipEntry | null;
    nemesisByRating?: PerformanceRelationshipEntry | null;
    favoriteTargetByCount?: PerformanceRelationshipEntry | null;
    nemesisByCount?: PerformanceRelationshipEntry | null;
  };
}

export interface UserStats {
  user: User & { isFavorite?: boolean };
  sport?: Sport;
  levelHistory: LevelHistoryItem[];
  socialLevelHistory?: LevelHistoryItem[];
  gamesLast30Days: number;
  gamesLast30DaysAllSports?: number;
  followersCount: number;
  followingCount: number;
  gamesStats: GamesStat[];
  gamesStatsAllSports?: GamesStat[];
  performanceInsights?: UserPerformanceInsights;
}

export interface PlayerComparison {
  otherUser: BasicUser;
  gamesTogether: {
    total: number;
    gamesCoplayed: number;
    wins: number;
    losses: number;
    ties: number;
    winRate: string;
  };
  gamesAgainst: {
    total: number;
    wins: number;
    losses: number;
    ties: number;
    winRate: string;
  };
  gamesAgainstEachOther?: Array<{
    id: string;
    name?: string;
    gameType: GameType;
    startTime: string;
    endTime: string;
    status: GameStatus;
    resultsStatus: 'NONE' | 'IN_PROGRESS' | 'FINAL';
    entityType: EntityType;
    maxParticipants: number;
    minParticipants: number;
    isPublic: boolean;
    affectsRating: boolean;
    allowDirectJoin: boolean;
    hasFixedTeams?: boolean;
    genderTeams?: string;
    photosCount?: number;
    participants: Array<{
      id: string;
      userId: string;
      role: ParticipantRole;
      status: ParticipantStatus;
      joinedAt: string;
      stats?: any;
      user: BasicUser;
    }>;
    club?: {
      id: string;
      name: string;
      city?: {
        id: string;
        name: string;
      } | null;
    } | null;
    court?: {
      id: string;
      name: string;
      club?: {
        id: string;
        name: string;
        city?: {
          id: string;
          name: string;
        } | null;
      } | null;
    } | null;
    createdAt: string;
    updatedAt: string;
  }>;
  currentUserStats?: {
    gamesLast30Days: number;
    gamesStats: GamesStat[];
  };
  otherUserStats?: {
    gamesLast30Days: number;
    gamesStats: GamesStat[];
  };
}

export interface InvitablePlayer extends BasicUser {
  interactionCount: number;
  gamesTogetherCount: number;
}

export interface InvitablePlayersPayload {
  players: InvitablePlayer[];
  maxSocialLevel: number;
}

export interface GameWorkoutSessionListItem extends GameWorkoutSummary {
  game: {
    id: string;
    name: string | null;
    gameType: string;
    startTime: string;
    club: { id: string; name: string } | null;
  };
}

export type NotificationChannelType = 'PUSH' | 'TELEGRAM' | 'WHATSAPP' | 'VIBER';

export interface NotificationPreference {
  channelType: NotificationChannelType;
  sendMessages: boolean;
  sendInvites: boolean;
  sendDirectMessages: boolean;
  sendReminders: boolean;
  sendWalletNotifications: boolean;
  sendMarketplaceNotifications: boolean;
  sendTeamNotifications: boolean;
}

export type ReactionEmojiUsageRow = { emoji: string; count: number; lastUsedAt: string | null };

export type ReactionEmojiUsageApiData =
  | { version: number; unchanged: true; items: [] }
  | { version: number; items: ReactionEmojiUsageRow[] };

export interface SportQuestionnaireStatus {
  completed: boolean;
  skipped: boolean;
  suggested: boolean;
  level: number;
  gamesPlayed: number;
}

export const usersApi = {
  getProfile: async () => {
    const response = await api.get<ApiResponse<User>>('/users/profile');
    return response.data;
  },

  getWorkoutSessions: async (params?: { limit?: number; from?: string; to?: string }) => {
    const response = await api.get<ApiResponse<GameWorkoutSessionListItem[]>>('/users/workout-sessions', { params });
    return response.data;
  },

  syncTelegramProfile: async () => {
    const response = await api.post<ApiResponse<User>>('/users/profile/sync-telegram');
    return response.data;
  },

  createTelegramLinkIntent: async () => {
    const response = await api.post<ApiResponse<{ linkToken: string }>>('/users/profile/telegram-link-intent');
    return response.data;
  },

  getNotificationPreferences: async () => {
    const response = await api.get<ApiResponse<NotificationPreference[]>>('/users/notification-preferences');
    return response.data;
  },

  updateNotificationPreferences: async (preferences: Array<Partial<NotificationPreference> & { channelType: NotificationChannelType }>) => {
    const response = await api.put<ApiResponse<NotificationPreference[]>>('/users/notification-preferences', { preferences });
    return response.data;
  },

  updateProfile: async (data: Partial<User>) => {
    const response = await api.put<ApiResponse<User>>('/users/profile', data);
    return response.data;
  },

  addSport: async (sport: string) => {
    const response = await api.post<ApiResponse<User> & { suggestedQuestionnaire?: boolean }>(
      '/users/sports',
      { sport },
    );
    return {
      data: response.data.data,
      suggestedQuestionnaire: response.data.suggestedQuestionnaire === true,
    };
  },

  setPrimarySport: async (sport: string) => {
    const response = await api.put<ApiResponse<User>>('/users/primary-sport', { sport });
    return response.data;
  },

  confirmPrimarySport: async (sports: string[], primarySport: string) => {
    const response = await api.post<ApiResponse<User>>('/users/primary-sport/confirm', {
      sports,
      primarySport,
    });
    return response.data;
  },

  updateSportProfileLevel: async (sport: string, level: number) => {
    const response = await api.put<ApiResponse<User>>(`/users/sport-profiles/${sport}/level`, { level });
    return response.data;
  },

  updateSportExternalRating: async (sport: string, externalRatingHint: string | null) => {
    const response = await api.put<ApiResponse<User>>(`/users/sport-profiles/${sport}/external-rating`, {
      externalRatingHint,
    });
    return response.data;
  },

  syncPlaytomicProfile: async (
    levels: Array<{ playtomicSportId: string; level: number; reliability?: number }>,
  ) => {
    const response = await api.post<ApiResponse<User>>('/users/profile/sync-playtomic', { levels });
    return response.data;
  },

  removeSport: async (sport: string) => {
    const response = await api.delete<ApiResponse<User>>(`/users/me/sports/${sport}`);
    return response.data;
  },

  getMySportActivity: async () => {
    const response = await api.get<
      ApiResponse<Array<{ sport: Sport; gamesLast7Days: number; gamesLast30Days: number }>>
    >('/users/me/sport-activity');
    return response.data;
  },

  switchCity: async (cityId: string) => {
    const response = await api.post<ApiResponse<User>>('/users/switch-city', { cityId });
    return response.data;
  },

  completeWelcomeScreen: async (answers: string[]) => {
    const response = await api.post<ApiResponse<User>>('/users/welcome-screen', { answers });
    return response.data;
  },

  resetWelcomeScreen: async () => {
    const response = await api.post<ApiResponse<User>>('/users/welcome-screen/reset');
    return response.data;
  },

  skipWelcomeScreen: async () => {
    const response = await api.post<ApiResponse<User>>('/users/welcome-screen/skip');
    return response.data;
  },

  getSportQuestionnaireStatus: async (sport: Sport) => {
    try {
      const response = await api.get<ApiResponse<SportQuestionnaireStatus>>(
        `/users/me/sports/${sport}/questionnaire/status`,
      );
      return response.data;
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 404) {
        return { success: true, data: null };
      }
      throw err;
    }
  },

  completeSportQuestionnaire: async (sport: Sport, answers: string[]) => {
    const response = await api.post<ApiResponse<User>>(`/users/me/sports/${sport}/questionnaire`, {
      answers,
    });
    return response.data;
  },

  skipSportQuestionnaire: async (sport: Sport) => {
    const response = await api.post<ApiResponse<User>>(
      `/users/me/sports/${sport}/questionnaire/skip`,
    );
    return response.data;
  },

  getUserStats: async (userId: string, sport?: Sport) => {
    const params: Record<string, string> = {};
    if (sport) params.sport = sport;
    const response = await api.get<ApiResponse<UserStats>>(`/users/${userId}/stats`, { params });
    return response.data;
  },

  getInvitablePlayers: async (gameId?: string, sport?: string, search?: string) => {
    const params: Record<string, string> = {};
    if (gameId) params.gameId = gameId;
    if (sport) params.sport = sport;
    if (search?.trim()) params.search = search.trim();
    const response = await api.get<ApiResponse<InvitablePlayersPayload>>('/users/invitable-players', {
      params,
    });
    return response.data;
  },

  getBasicUsersByIds: async (userIds: string[], messageId: string) => {
    const ids = [...new Set(userIds.filter(Boolean))].slice(0, MAX_BASIC_USERS_BY_IDS);
    if (ids.length === 0) return [];
    const response = await api.post<ApiResponse<BasicUser[]>>('/users/basic-by-ids', {
      ids,
      messageId,
    });
    return response.data.data ?? [];
  },

  trackInteraction: async (targetUserId: string) => {
    const response = await api.post<ApiResponse<any>>('/users/track-interaction', {
      targetUserId,
    });
    return response.data;
  },

  getPlayerComparison: async (otherUserId: string, sport?: Sport) => {
    const params: Record<string, string> = {};
    if (sport) params.sport = sport;
    const response = await api.get<ApiResponse<PlayerComparison>>(`/users/compare/${otherUserId}`, { params });
    return response.data;
  },

  getUserLevelChanges: async (userId: string, options?: { limit?: number; sport?: Sport }) => {
    const response = await api.get<ApiResponse<LevelHistoryItem[]>>(`/level-changes/${userId}`, {
      params: {
        ...(options?.limit ? { limit: options.limit } : {}),
        ...(options?.sport ? { sport: options.sport } : {}),
      },
    });
    return response.data;
  },

  getGameLevelChanges: async (gameId: string) => {
    const response = await api.get<ApiResponse<(LevelHistoryItem & { userId: string; user?: User })[]>>(`/level-changes/game/${gameId}`);
    return response.data;
  },

  deleteUser: async () => {
    const response = await api.delete<ApiResponse<{ message: string }>>('/users/profile');
    return response.data;
  },

  setFavoriteTrainer: async (trainerId: string | null) => {
    const response = await api.put<ApiResponse<{ favoriteTrainerId: string | null }>>('/users/favorite-trainer', { trainerId });
    return response.data;
  },

  getPresence: async (userIds: string[]) => {
    if (userIds.length === 0) return {} as Record<string, boolean>;
    const ids = [...new Set(userIds)].slice(0, 3000);
    const response = await api.get<ApiResponse<Record<string, boolean>>>('/users/presence', {
      params: { ids: ids.join(',') },
    });
    return response.data.data;
  },

  getReactionEmojiUsage: async (params?: { sinceVersion?: number }) => {
    const response = await api.get<ApiResponse<ReactionEmojiUsageApiData>>('/users/me/reaction-emoji-usage', {
      params: params?.sinceVersion != null ? { sinceVersion: params.sinceVersion } : undefined,
    });
    return response.data;
  },

  getCommonChats: async (userId: string) => {
    const response = await api.get<ApiResponse<CommonChatItem[]>>(`/users/${userId}/common-groups`);
    return response.data;
  },
};
