import api from './axios';
import { MAX_BASIC_USERS_BY_IDS } from '@/services/users/basicUsersBatchLimits';
import { ApiResponse, User, BasicUser, EntityType, GameType, GameStatus, ParticipantRole, ParticipantStatus } from '@/types';
import type { GameWorkoutSummary } from './games';

export interface LevelHistoryItem {
  id: string;
  gameId: string;
  levelBefore: number;
  levelAfter: number;
  levelChange: number;
  createdAt: string;
  eventType?: 'GAME' | 'LUNDA' | 'SET' | 'QUESTIONNAIRE' | 'OTHER' | 'SOCIAL_BAR' | 'SOCIAL_PARTICIPANT';
}

export type GamesStatType = '30' | '90' | 'all';

export interface GamesStat {
  type: GamesStatType;
  wins: number;
  ties: number;
  losses: number;
  totalMatches: number;
}

export interface UserStats {
  user: User & { isFavorite?: boolean };
  levelHistory: LevelHistoryItem[];
  socialLevelHistory?: LevelHistoryItem[];
  gamesLast30Days: number;
  followersCount: number;
  followingCount: number;
  gamesStats: GamesStat[];
}

export interface PlayerComparison {
  otherUser: BasicUser;
  gamesTogether: {
    total: number;
    gamesCoplayed: number;
    wins: number;
    losses: number;
    winRate: string;
  };
  gamesAgainst: {
    total: number;
    wins: number;
    losses: number;
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

  getUserStats: async (userId: string) => {
    const response = await api.get<ApiResponse<UserStats>>(`/users/${userId}/stats`);
    return response.data;
  },

  getInvitablePlayers: async (gameId?: string) => {
    const response = await api.get<ApiResponse<InvitablePlayersPayload>>('/users/invitable-players', {
      params: gameId ? { gameId } : {},
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

  getPlayerComparison: async (otherUserId: string) => {
    const response = await api.get<ApiResponse<PlayerComparison>>(`/users/compare/${otherUserId}`);
    return response.data;
  },

  getUserLevelChanges: async (userId: string, limit?: number) => {
    const response = await api.get<ApiResponse<LevelHistoryItem[]>>(`/level-changes/${userId}`, {
      params: limit ? { limit } : {},
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
};

