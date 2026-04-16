export type WinnerOfGame = 'BY_MATCHES_WON' | 'BY_POINTS' | 'BY_SCORES_DELTA' | 'PLAYOFF_FINALS';
export type WinnerOfMatch = 'BY_SETS' | 'BY_SCORES';

export interface GenBasicUser {
  id: string;
  level: number;
  gender: string;
  firstName?: string;
  lastName?: string;
  avatar?: string | null;
  socialLevel?: number;
  approvedLevel?: boolean;
  isTrainer?: boolean;
}

export interface GenParticipant {
  userId: string;
  status: string;
  user: GenBasicUser;
}

export interface GenFixedTeamPlayer {
  userId: string;
  user: GenBasicUser;
}

export interface GenFixedTeam {
  id: string;
  teamNumber: number;
  players: GenFixedTeamPlayer[];
}

export interface GenGameCourt {
  courtId: string;
  order: number;
}

export interface GenSetResult {
  teamA: number;
  teamB: number;
  isTieBreak?: boolean;
}

export interface GenMatch {
  id: string;
  teamA: string[];
  teamB: string[];
  sets: GenSetResult[];
  winnerId?: 'teamA' | 'teamB' | null;
  courtId?: string;
}

export interface GenRound {
  id: string;
  matches: GenMatch[];
}

export interface GenGame {
  id: string;
  participants: GenParticipant[];
  hasFixedTeams?: boolean;
  fixedTeams?: GenFixedTeam[];
  gameCourts?: GenGameCourt[];
  matchGenerationType?: string | null;
  genderTeams?: string;
  fixedNumberOfSets?: number;
  entityType: string;
  parentId?: string | null;
  leagueGroupId?: string | null;
  winnerOfGame?: WinnerOfGame;
  winnerOfMatch?: WinnerOfMatch;
  pointsPerWin?: number;
  pointsPerTie?: number;
  pointsPerLoose?: number;
}
