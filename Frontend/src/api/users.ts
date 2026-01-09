import api from './axios';
import { ApiResponse, User, BasicUser, EntityType, GameType, GameStatus, ParticipantRole } from '@/types';

export interface LevelHistoryItem {
  id: string;
  gameId: string;
  levelBefore: number;
  levelAfter: number;
  levelChange: number;
  createdAt: string;
  eventType?: 'GAME' | 'LUNDA' | 'SET' | 'OTHER' | 'SOCIAL_BAR';
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
      isPlaying: boolean;
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
    totalGames: number;
    totalMatches: number;
    gamesLast30Days: number;
    totalWins: number;
    winsPercentage: string;
  };
  otherUserStats?: {
    totalGames: number;
    totalMatches: number;
    gamesLast30Days: number;
    totalWins: number;
    winsPercentage: string;
  };
}

export interface InvitablePlayer extends BasicUser {
  interactionCount: number;
}

export const usersApi = {
  getProfile: async () => {
    const response = await api.get<ApiResponse<User>>('/users/profile');
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

  getUserStats: async (userId: string) => {
    const response = await api.get<ApiResponse<UserStats>>(`/users/${userId}/stats`);
    return response.data;
  },

  getInvitablePlayers: async (gameId?: string) => {
    const response = await api.get<ApiResponse<InvitablePlayer[]>>('/users/invitable-players', {
      params: gameId ? { gameId } : {},
    });
    return response.data;
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
};

