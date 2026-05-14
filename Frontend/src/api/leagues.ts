import api from './axios';
import type { ApiResponse, Game, GameSetupParams, Gender } from '@/types';

export interface CreateLeagueRequest {
  resultsRoundGenV2?: boolean;
  name: string;
  description?: string;
  cityId: string;
  clubId?: string;
  hasFixedTeams?: boolean;
  allowUserInMultipleTeams?: boolean;
  season: {
    name: string;
    minLevel: number;
    maxLevel: number;
    maxParticipants: number;
    startDate: string;
    gameSeason?: {
      fixedNumberOfSets: number;
      maxTotalPointsPerSet: number;
      maxPointsPerTeam: number;
      matchTimedCapMinutes?: number;
      matchTimerEnabled?: boolean;
      winnerOfGame: string;
      winnerOfMatch: string;
      matchGenerationType: string;
      pointsPerWin: number;
      pointsPerLoose: number;
      pointsPerTie: number;
      ballsInGames?: boolean;
      scoringPreset?: string | null;
      scoringMode?: string;
      hasGoldenPoint?: boolean;
      gameType?: string;
    };
  };
}

export interface League {
  id: string;
  name: string;
  description?: string;
  hasFixedTeams: boolean;
  cityId: string;
  clubId?: string;
  createdAt: string;
  updatedAt: string;
  seasons?: Array<{
    id: string;
    game?: {
      id: string;
    };
  }>;
}

export type LeagueRoundType = 'REGULAR' | 'PLAYOFF';

export interface LeagueRound {
  id: string;
  leagueSeasonId: string;
  orderIndex: number;
  roundType?: LeagueRoundType;
  sentStartMessage: boolean;
  createdAt: string;
  updatedAt: string;
  games: Game[];
}

export interface LeagueStanding {
  id: string;
  leagueId: string;
  leagueSeasonId: string;
  participantType: 'USER' | 'TEAM';
  userId?: string;
  leagueTeamId?: string;
  currentGroupId?: string;
  points: number;
  wins: number;
  ties: number;
  losses: number;
  scoreDelta: number;
  user?: any;
  leagueTeam?: {
    id: string;
    players: Array<{
      id: string;
      userId: string;
      user: any;
    }>;
  };
  currentGroup?: {
    id: string;
    name: string;
    betterGroupId?: string | null;
    worseGroupId?: string | null;
    color?: string | null;
  };
}

export interface LeagueGroup {
  id: string;
  leagueSeasonId: string;
  name: string;
   color?: string | null;
  betterGroupId?: string;
  worseGroupId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeagueGroupWithParticipants extends LeagueGroup {
  participants: LeagueStanding[];
}

export interface LeagueGroupManagementPayload {
  groups: LeagueGroupWithParticipants[];
  unassignedParticipants: LeagueStanding[];
}

export type LeaguePlannerBucketId = 'night' | 'morning' | 'afternoon' | 'evening';

export interface LeaguePlannerDayBucket {
  bucket: LeaguePlannerBucketId;
  freeCount: number;
  busyCount: number;
  sampleFreeUsers: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
    level: number;
    socialLevel: number;
    gender: Gender;
    approvedLevel: boolean;
    isTrainer: boolean;
  }>;
}

export interface LeaguePlannerDay {
  date: string;
  weekdayKey: string;
  isPast: boolean;
  buckets: LeaguePlannerDayBucket[];
}

export interface LeaguePlannerUnscheduledGame {
  id: string;
  name: string | null;
  roundOrderIndex: number;
  leagueGroupId: string | null;
  groupName: string | null;
  sideAUserIds: string[];
  sideBUserIds: string[];
  sideALabel: string;
  sideBLabel: string;
}

export interface LeaguePlannerPayload {
  weekStart: string;
  timeZone: string;
  hasFixedTeams: boolean;
  hasGroups: boolean;
  groupIds: string[];
  boundaries: { night: number; morning: number; afternoon: number; evening: number };
  days: LeaguePlannerDay[];
  unscheduledGames: LeaguePlannerUnscheduledGame[];
  schedulableBySlot: Record<string, string[]>;
  participantSummaries: Array<{
    standingId: string;
    userId: string | null;
    leagueTeamId: string | null;
    groupId: string | null;
    groupName: string | null;
  }>;
}

export const leaguesApi = {
  create: async (data: CreateLeagueRequest) => {
    const response = await api.post<ApiResponse<League>>('/leagues', data);
    return response.data;
  },
  getRounds: async (leagueSeasonId: string) => {
    const response = await api.get<ApiResponse<LeagueRound[]>>(`/leagues/${leagueSeasonId}/rounds`);
    return response.data;
  },
  getStandings: async (leagueSeasonId: string) => {
    const response = await api.get<ApiResponse<LeagueStanding[]>>(`/leagues/${leagueSeasonId}/standings`);
    return response.data;
  },
  createRound: async (leagueSeasonId: string, creationType?: string) => {
    const response = await api.post<ApiResponse<LeagueRound>>(`/leagues/${leagueSeasonId}/rounds`, { creationType });
    return response.data;
  },
  createFullRoundRobin: async (leagueSeasonId: string) => {
    const response = await api.post<ApiResponse<{ roundsCreated: number }>>(
      `/leagues/${leagueSeasonId}/rounds/full-round-robin`
    );
    return response.data;
  },
  createGameForRound: async (leagueRoundId: string, leagueGroupId?: string) => {
    const response = await api.post<ApiResponse<any>>(`/leagues/rounds/${leagueRoundId}/games`, {
      leagueGroupId,
    });
    return response.data;
  },
  deleteRound: async (leagueRoundId: string) => {
    const response = await api.delete<ApiResponse<void>>(`/leagues/rounds/${leagueRoundId}`);
    return response.data;
  },
  syncParticipants: async (leagueSeasonId: string) => {
    const response = await api.post<ApiResponse<LeagueStanding[]>>(`/leagues/${leagueSeasonId}/sync-participants`);
    return response.data;
  },
  createGroups: async (leagueSeasonId: string, numberOfGroups: number) => {
    const response = await api.post<ApiResponse<LeagueGroup[]>>(`/leagues/${leagueSeasonId}/groups`, { numberOfGroups });
    return response.data;
  },
  getGroups: async (leagueSeasonId: string) => {
    const response = await api.get<ApiResponse<LeagueGroupManagementPayload>>(`/leagues/${leagueSeasonId}/groups`);
    return response.data;
  },
  createManualGroup: async (leagueSeasonId: string, name: string) => {
    const response = await api.post<ApiResponse<LeagueGroupManagementPayload>>(`/leagues/${leagueSeasonId}/groups/manual`, { name });
    return response.data;
  },
  renameGroup: async (groupId: string, name: string) => {
    const response = await api.patch<ApiResponse<LeagueGroupManagementPayload>>(`/leagues/groups/${groupId}`, { name });
    return response.data;
  },
  deleteGroup: async (groupId: string) => {
    const response = await api.delete<ApiResponse<LeagueGroupManagementPayload>>(`/leagues/groups/${groupId}`);
    return response.data;
  },
  addParticipantToGroup: async (groupId: string, participantId: string) => {
    const response = await api.post<ApiResponse<LeagueGroupManagementPayload>>(`/leagues/groups/${groupId}/participants`, { participantId });
    return response.data;
  },
  removeParticipantFromGroup: async (groupId: string, participantId: string) => {
    const response = await api.delete<ApiResponse<LeagueGroupManagementPayload>>(`/leagues/groups/${groupId}/participants/${participantId}`);
    return response.data;
  },
  reorderGroups: async (leagueSeasonId: string, groupIds: string[]) => {
    const response = await api.put<ApiResponse<LeagueGroupManagementPayload>>(`/leagues/${leagueSeasonId}/groups/reorder`, { groupIds });
    return response.data;
  },
  sendRoundStartMessage: async (leagueRoundId: string) => {
    const response = await api.post<ApiResponse<{ success: boolean; notifiedUsers: number }>>(`/leagues/rounds/${leagueRoundId}/send-start-message`);
    return response.data;
  },
  getPlanner: async (
    leagueSeasonId: string,
    params: {
      weekStart: string;
      groupId?: string;
      aggregateUserId?: string;
      aggregateIntersectUserIds?: string[];
      pickAggregatePending?: boolean;
    }
  ) => {
    const qs = new URLSearchParams();
    qs.set('weekStart', params.weekStart);
    if (params.groupId && params.groupId !== 'ALL') qs.set('groupId', params.groupId);
    if (params.aggregateUserId) qs.set('aggregateUserId', params.aggregateUserId);
    if (params.aggregateIntersectUserIds?.length) {
      qs.set('aggregateIntersectUserIds', params.aggregateIntersectUserIds.join(','));
    }
    if (params.pickAggregatePending) qs.set('pickAggregatePending', 'true');
    const response = await api.get<ApiResponse<LeaguePlannerPayload>>(
      `/leagues/${leagueSeasonId}/planner?${qs.toString()}`
    );
    return response.data;
  },
  createPlayoff: async (
    leagueSeasonId: string,
    payload:
      | {
          gameType: 'WINNER_COURT' | 'AMERICANO';
          participantIds: string[];
          leagueGroupId?: string;
          gameSetup?: GameSetupParams;
          resultsRoundGenV2?: boolean;
        }
      | {
          gameType: 'WINNER_COURT' | 'AMERICANO';
          groups: { leagueGroupId: string; participantIds: string[] }[];
          gameSetup?: GameSetupParams;
          resultsRoundGenV2?: boolean;
        }
  ) => {
    const response = await api.post<
      ApiResponse<{ round: LeagueRound; game?: unknown; games?: unknown[] }>
    >(`/leagues/${leagueSeasonId}/playoff`, payload);
    return response.data;
  },
};

