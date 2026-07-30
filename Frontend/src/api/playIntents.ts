import api from './axios';
import type { Sport } from '@/types';

export type PlayIntentTimeOfDay = 'ANYTIME' | 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM';
export type PlayIntentStatus = 'OPEN' | 'MATCHED' | 'CONSUMED' | 'EXPIRED' | 'CANCELLED';

export type PlayIntent = {
  id: string;
  cityId: string;
  sport: Sport;
  entityType: 'GAME' | 'BAR';
  dateKeys: string[];
  timeOfDay: PlayIntentTimeOfDay;
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
  busyInGame: boolean;
  inProposal?: boolean;
  eligibleForProposal?: boolean;
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

export type PlayIntentPool = {
  todayKey: string;
  cityTimezone: string;
  discoveryDateKeys: string[];
  myIntent: PlayIntent | null;
  partySize: number;
  availableCount: number;
  clusterProgress: number;
  members: PoolMember[];
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
};
