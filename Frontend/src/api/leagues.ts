import api from './axios';
import { ApiResponse, Game } from '@/types';

export interface CreateLeagueRequest {
  name: string;
  description?: string;
  cityId: string;
  clubId?: string;
  hasFixedTeams?: boolean;
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
      winnerOfGame: string;
      winnerOfMatch: string;
      participantLevelUpMode: string;
      matchGenerationType: string;
      prohibitMatchesEditing?: boolean;
      pointsPerWin: number;
      pointsPerLoose: number;
      pointsPerTie: number;
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

export interface LeagueRound {
  id: string;
  leagueSeasonId: string;
  orderIndex: number;
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
};

