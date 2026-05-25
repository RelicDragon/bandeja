import api from './axios';
import type { ApiResponse, Game, GameSetupParams, Gender, Sport } from '@/types';

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
    sport?: Sport;
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

export type PlayoffFormat = 'SESSION' | 'BRACKET';
export type BracketScope = 'PER_GROUP' | 'CROSS_GROUP';
export type CrossGroupSeedingPreset = 'WINNERS_THEN_RUNNERS_UP' | 'GROUP_BLOCK' | 'MANUAL';
export type BracketSlotKind =
  | 'PLAY_IN'
  | 'BYE'
  | 'MAIN'
  | 'THIRD_PLACE'
  | 'CONSOLATION'
  | 'LOSERS'
  | 'GRAND_FINAL';

export interface LeagueRound {
  id: string;
  leagueSeasonId: string;
  orderIndex: number;
  roundType?: LeagueRoundType;
  playoffFormat?: PlayoffFormat;
  bracketScope?: BracketScope;
  entrantCount?: number;
  bracketSize?: number;
  byeCount?: number;
  bracketConfig?: BracketRoundConfigDto | null;
  sentStartMessage: boolean;
  createdAt: string;
  updatedAt: string;
  games: Game[];
}

export interface BracketSlotGameSummary {
  id: string;
  resultsStatus?: string;
  startTime?: string | null;
}

export interface BracketOriginGroupDto {
  id: string;
  name: string;
  color?: string | null;
}

export interface BracketSlotDto {
  id: string;
  slotKey: string;
  slotKind: BracketSlotKind;
  phaseIndex: number;
  roundIndex: number;
  matchIndex: number;
  leagueParticipantId?: string | null;
  gameId?: string | null;
  seedRank?: number | null;
  roundLabel?: string | null;
  feederSlotAId?: string | null;
  feederSlotBId?: string | null;
  winnerSlotId?: string | null;
  originGroupId?: string | null;
  originGroup?: BracketOriginGroupDto | null;
  participant?: {
    id: string;
    seedRank?: number | null;
    displayName?: string | null;
    originGroupId?: string | null;
    originGroup?: BracketOriginGroupDto | null;
    leagueTeam?: {
      id: string;
      players: Array<{ id: string; userId: string; user?: import('@/types').BasicUser }>;
    };
  } | null;
  game?: Game | BracketSlotGameSummary | null;
}

export interface BracketPlayoffGroupDto {
  leagueGroupId: string | null;
  entrantCount: number;
  bracketSize: number;
  byeCount: number;
  playInGameCount: number;
  includeConsolationBracket?: boolean;
  includeDoubleElimination?: boolean;
  slots: BracketSlotDto[];
  championParticipantId?: string;
}

export interface BracketPlayoffResponse {
  round: LeagueRound;
  groups: BracketPlayoffGroupDto[];
}

export type CustomPlayInPairingDto = { seedA: number; seedB: number };

export interface CreateBracketPlayoffGroupEntry {
  leagueGroupId: string;
  participantIds: string[];
  includeThirdPlace?: boolean;
  includeConsolationBracket?: boolean;
  includeDoubleElimination?: boolean;
  customByeSeedRanks?: number[];
  customPlayInPairings?: CustomPlayInPairingDto[];
}

export interface CreateBracketPlayoffPerGroupRequest {
  bracketScope?: 'PER_GROUP';
  includeThirdPlace?: boolean;
  includeConsolationBracket?: boolean;
  includeDoubleElimination?: boolean;
  customPlayInPairings?: CustomPlayInPairingDto[];
  groups: CreateBracketPlayoffGroupEntry[];
  gameSetup?: GameSetupParams;
  resultsRoundGenV2?: boolean;
}

export interface TeamsPerGroupEntryDto {
  leagueGroupId: string;
  k: number;
}

export interface CreateBracketPlayoffCrossGroupRequest {
  bracketScope: 'CROSS_GROUP';
  crossGroup: {
    equalTopK?: number;
    unequalK?: boolean;
    teamsPerGroup?: TeamsPerGroupEntryDto[];
    includedGroupIds?: string[];
    seedingPreset: CrossGroupSeedingPreset;
    globalParticipantIds?: string[];
    qualifiers?: { leagueGroupId: string; participantIds: string[] }[];
    includeThirdPlace?: boolean;
    includeConsolationBracket?: boolean;
    includeDoubleElimination?: boolean;
    customByeSeedRanks?: number[];
    customPlayInPairings?: CustomPlayInPairingDto[];
  };
  gameSetup?: GameSetupParams;
  resultsRoundGenV2?: boolean;
}

export type CreateBracketPlayoffRequest =
  | CreateBracketPlayoffPerGroupRequest
  | CreateBracketPlayoffCrossGroupRequest;

export interface BracketRoundConfigDto {
  seedingLocked?: boolean;
  scope?: 'CROSS_GROUP';
  equalTopK?: number;
  teamsPerGroup?: Record<string, number>;
}

export interface NotifyBracketSummaryRequest {
  roundId?: string;
  leagueGroupId?: string;
}

export interface PatchBracketSlotsRequest {
  roundId?: string;
  seedingLocked?: boolean;
  slots?: Array<{
    slotId: string;
    leagueParticipantId?: string | null;
    /** Required for play-in / knockout match slots; team 1 = A, team 2 = B. */
    side?: 'A' | 'B';
  }>;
  gameTeamUpdates?: Array<{
    gameId: string;
    participantA: string;
    participantB: string;
  }>;
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

export interface LeaguePlannerDayHour {
  hour: number;
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
  hours: LeaguePlannerDayHour[];
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
  recreateFullRoundRobin: async (leagueSeasonId: string) => {
    const response = await api.post<
      ApiResponse<{
        gamesDeleted: number;
        gamesMoved: number;
        roundsDeleted: number;
        roundsCreated: number;
        gamesCreated: number;
        gamesPreservedDueToChat: number;
        gamesPreservedFinal: number;
        gamesPreservedInProgress: number;
        gamesPreservedScheduled: number;
        roundsSkippedDueToRemainingGames: number;
        standingsParticipantsReset: number;
        standingsGamesSynced: number;
      }>
    >(`/leagues/${leagueSeasonId}/rounds/full-round-robin/recreate`);
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
  createBracketPlayoff: async (leagueSeasonId: string, payload: CreateBracketPlayoffRequest) => {
    const response = await api.post<ApiResponse<BracketPlayoffResponse>>(
      `/leagues/${leagueSeasonId}/playoff/bracket`,
      payload
    );
    return response.data;
  },
  getBracketPlayoff: async (
    leagueSeasonId: string,
    params?: { roundId?: string; leagueGroupId?: string }
  ) => {
    const qs = new URLSearchParams();
    if (params?.roundId) qs.set('roundId', params.roundId);
    if (params?.leagueGroupId) qs.set('leagueGroupId', params.leagueGroupId);
    const query = qs.toString();
    const response = await api.get<ApiResponse<BracketPlayoffResponse>>(
      `/leagues/${leagueSeasonId}/playoff/bracket${query ? `?${query}` : ''}`
    );
    return response.data;
  },
  patchBracketSlots: async (leagueSeasonId: string, payload: PatchBracketSlotsRequest) => {
    const response = await api.patch<ApiResponse<BracketPlayoffResponse>>(
      `/leagues/${leagueSeasonId}/playoff/bracket/slots`,
      payload
    );
    return response.data;
  },
  awardBracketWalkover: async (
    leagueSeasonId: string,
    slotId: string,
    payload: { leagueParticipantId: string; skipGameFinal?: boolean }
  ) => {
    const response = await api.post<ApiResponse<BracketPlayoffResponse>>(
      `/leagues/${leagueSeasonId}/playoff/bracket/slots/${slotId}/walkover`,
      payload
    );
    return response.data;
  },
  notifyBracketSummary: async (
    leagueSeasonId: string,
    payload?: NotifyBracketSummaryRequest
  ) => {
    const response = await api.post<ApiResponse<{ notifiedUsers: number }>>(
      `/leagues/${leagueSeasonId}/playoff/bracket/notify-summary`,
      payload ?? {}
    );
    return response.data;
  },
};

