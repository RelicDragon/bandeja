import api from './axios';
import { ApiResponse } from '@/types';

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
  games: any[];
}

export interface LeagueStanding {
  id: string;
  leagueId: string;
  leagueSeasonId: string;
  participantType: 'USER' | 'TEAM';
  userId?: string;
  leagueTeamId?: string;
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
  createRound: async (leagueSeasonId: string) => {
    const response = await api.post<ApiResponse<LeagueRound>>(`/leagues/${leagueSeasonId}/rounds`);
    return response.data;
  },
};

