import api from './axios';
import type { GroupChannel } from './chat';
import type { Sport } from '@/types';

export type PlayIntentTimeOfDay = 'ANYTIME' | 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM';
export type PlayIntentStatus = 'OPEN' | 'MATCHED' | 'CONSUMED' | 'EXPIRED' | 'CANCELLED';

export type FitDimension = 'dates' | 'clubs' | 'time' | 'level' | 'gender';

/**
 * One row of the per-condition fit breakdown used by the court-lobby player
 * card. `ok` is true when the viewer's intent and this player's intent agree on
 * the dimension; `period` carries the other player's dominant time-of-day so a
 * time row can read naturally ("Plays mornings", "11:00–13:00").
 */
export type FitCheck = {
  dimension: FitDimension;
  ok: boolean;
  period?: PlayIntentTimeOfDay;
  startTime?: string | null;
  endTime?: string | null;
};

export type PlayIntent = {
  id: string;
  cityId: string;
  sport: Sport;
  entityType: 'GAME' | 'BAR';
  dateKeys: string[];
  timeOfDay: PlayIntentTimeOfDay;
  timeOfDays?: PlayIntentTimeOfDay[];
  startTime: string | null;
  endTime: string | null;
  clubIds: string[];
  minLevel: number | null;
  maxLevel: number | null;
  genderTeams: 'ANY' | 'MEN' | 'WOMEN' | 'MIX_PAIRS';
  status: PlayIntentStatus;
  expiresAt: string;
};

export type CreatePlayIntentDto = {
  cityId?: string;
  sport?: Sport;
  entityType?: 'GAME' | 'BAR';
  dayOffsets?: number[];
  dateKeys?: string[];
  timeOfDay?: PlayIntentTimeOfDay;
  timeOfDays?: PlayIntentTimeOfDay[];
  startTime?: string | null;
  endTime?: string | null;
  clubIds?: string[];
  minLevel?: number | null;
  maxLevel?: number | null;
  genderTeams?: 'ANY' | 'MEN' | 'WOMEN' | 'MIX_PAIRS';
};

export type PoolMember = {
  userId: string;
  intentId: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  level: number | null;
  affinity: 'near' | 'mid' | 'far';
  affinityScore: number;
  status: 'OPEN' | 'MATCHED' | 'CONSUMED' | 'EXPIRED' | 'CANCELLED';
  inGame: boolean;
  inProposal?: boolean;
  eligibleForProposal?: boolean;
  mismatch?: {
    reason: 'dates' | 'clubs' | 'time' | 'level' | 'gender';
    period?: PlayIntentTimeOfDay;
    startTime?: string | null;
    endTime?: string | null;
  } | null;
  fit?: FitCheck[] | null;
};

export type MatchProposalSummary = {
  id: string;
  status?: string;
  hostUserId?: string | null;
  gameId?: string | null;
  dateKeys: string[];
  startTime: string | null;
  endTime: string | null;
  clubIds: string[];
  suggestedStartTime: string | null;
  expiresAt: string;
  members: {
    userId: string;
    intentId?: string;
    isHost: boolean;
    response: string;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
    level: number | null;
  }[];
};

export type InviteLookingMember = {
  userId: string;
  intentId: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  gender?: string | null;
  level: number | null;
  status: PlayIntentStatus;
  inProposal: boolean;
  inGame: boolean;
  matchesGame: boolean;
  fit: FitCheck[];
  mismatch: {
    reason: FitDimension;
    period?: PlayIntentTimeOfDay;
    startTime?: string | null;
    endTime?: string | null;
  } | null;
  gamesTogetherCount: number;
  matchScore: number;
};

export type InviteLookingPool = {
  cityId: string;
  sport: Sport;
  entityType: string;
  members: InviteLookingMember[];
  total: number;
};

export type MatchingLobbyGame = {
  id: string;
  entityType: 'GAME' | 'TOURNAMENT' | 'BAR' | 'TRAINING' | 'LEAGUE' | 'LEAGUE_SEASON';
  allowDirectJoin: boolean;
  genderTeams: string | null;
  startTime: string;
  timeLabel: string;
  club: { id: string; name: string } | null;
  maxParticipants: number;
  playingCount: number;
  playingAvatars: {
    userId: string;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
  }[];
  ownerAvatar: {
    userId: string;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
  } | null;
};

export type PlayIntentPool = {
  todayKey: string;
  cityTimezone: string;
  discoveryDateKeys: string[];
  myIntent: PlayIntent | null;
  partySize: number;
  availableCount: number;
  clusterProgress: number;
  members: PoolMember[];
  matchingGames: MatchingLobbyGame[];
  total: number;
  overflow: number;
  pendingProposal: MatchProposalSummary | null;
};

export type SharedPlayIntent = {
  id: string;
  creator: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
  };
  city: { id: string; name: string; timezone: string };
  sport: Sport;
  dateKeys: string[];
  timeOfDay: PlayIntentTimeOfDay;
  timeOfDays?: PlayIntentTimeOfDay[];
  startTime: string | null;
  endTime: string | null;
  clubs: { id: string; name: string }[];
  minLevel: number | null;
  maxLevel: number | null;
  genderTeams: 'ANY' | 'MEN' | 'WOMEN' | 'MIX_PAIRS';
  expiresAt: string;
};

export type CreatePrefill = {
  proposalId: string;
  sport: Sport;
  entityType?: 'GAME' | 'BAR';
  clubId?: string;
  startTime?: string;
  endTime?: string;
  inviteeIds: string[];
  dateKeys: string[];
  clubIds: string[];
  startTimeOfDay: string | null;
  endTimeOfDay: string | null;
};

export const playIntentsApi = {
  getMine: async (params?: { cityId?: string; sport?: string }) => {
    const { data } = await api.get<{ success: boolean; data: PlayIntent | null }>('/play-intents/me', {
      params,
    });
    return data.data;
  },

  create: async (body: CreatePlayIntentDto) => {
    const { data } = await api.post<{ success: boolean; data: PlayIntent }>('/play-intents', body);
    return data.data;
  },

  cancel: async (intentId?: string) => {
    const path = intentId ? `/play-intents/${intentId}` : '/play-intents/me';
    const { data } = await api.delete<{ success: boolean; data: { cancelled: number } }>(path);
    return data.data;
  },

  getPool: async (params?: { cityId?: string; sport?: string }) => {
    const { data } = await api.get<{ success: boolean; data: PlayIntentPool }>('/play-intents/pool', {
      params,
    });
    return {
      ...data.data,
      matchingGames: data.data.matchingGames ?? [],
    };
  },

  getInvitePool: async (body: {
    gameId?: string;
    cityId?: string;
    draft?: {
      sport: Sport;
      entityType?: string;
      cityId?: string;
      clubId?: string | null;
      startTime: string;
      endTime?: string;
      timeZone?: string | null;
      minLevel?: number | null;
      maxLevel?: number | null;
      genderTeams?: string | null;
    };
  }) => {
    const { data } = await api.post<{ success: boolean; data: InviteLookingPool }>(
      '/play-intents/invite-pool',
      body,
    );
    return data.data;
  },

  getShared: async (id: string) => {
    const { data } = await api.get<{ success: boolean; data: SharedPlayIntent }>(
      `/play-intents/shared/${id}`,
    );
    return data.data;
  },

  joinShared: async (id: string) => {
    const { data } = await api.post<{ success: boolean; data: PlayIntent }>(
      `/play-intents/shared/${id}/join`,
    );
    return data.data;
  },

  getProposal: async (id: string) => {
    const { data } = await api.get<{ success: boolean; data: MatchProposalSummary & { sport: Sport; status: string } }>(
      `/play-intents/proposals/${id}`,
    );
    return data.data;
  },

  confirmProposal: async (id: string) => {
    const { data } = await api.post<{
      success: boolean;
      data: { role: 'host' | 'invitee'; proposal: MatchProposalSummary; createPrefill: CreatePrefill | null };
    }>(`/play-intents/proposals/${id}/confirm`);
    return data.data;
  },

  declineProposal: async (id: string) => {
    const { data } = await api.post<{ success: boolean; data: { declined: boolean } }>(
      `/play-intents/proposals/${id}/decline`,
    );
    return data.data;
  },

  releaseProposal: async (id: string) => {
    const { data } = await api.post<{ success: boolean; data: { released: boolean; expired?: boolean } }>(
      `/play-intents/proposals/${id}/release`,
    );
    return data.data;
  },

  removeProposalMember: async (id: string, userId: string) => {
    const { data } = await api.post<{
      success: boolean;
      data: { removed: boolean; dissolved?: boolean; proposal: MatchProposalSummary | null };
    }>(`/play-intents/proposals/${id}/remove-member`, { userId });
    return data.data;
  },

  addProposalMember: async (id: string, body: { userId: string; intentId: string }) => {
    const { data } = await api.post<{
      success: boolean;
      data: { added: boolean; proposal: MatchProposalSummary };
    }>(`/play-intents/proposals/${id}/add-member`, body);
    return data.data;
  },

  discussGroup: async (userIds: string[]) => {
    const { data } = await api.post<{
      success: boolean;
      data: GroupChannel;
    }>('/play-intents/discuss', { userIds });
    return data.data;
  },
};
