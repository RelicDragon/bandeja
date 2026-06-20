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

export type GenMatchSetRole = 'OFFICIAL' | 'EXTRA_GAMES' | 'EXTRA_BALLS';

export interface GenSetResult {
  teamA: number;
  teamB: number;
  isTieBreak?: boolean;
  role?: GenMatchSetRole;
}

export interface GenMatch {
  id: string;
  teamA: string[];
  teamB: string[];
  sets: GenSetResult[];
  winnerId?: 'teamA' | 'teamB' | null;
  courtId?: string;
  /** `GameTeam.id` when this match side is a known fixed roster (overlap-safe identity). */
  fixedTeamIdA?: string;
  fixedTeamIdB?: string;
}

export interface GenRound {
  id: string;
  matches: GenMatch[];
}

export interface GenGame {
  id: string;
  sport?: import('@prisma/client').Sport;
  /** Event roster cap (ADR-002). */
  maxParticipants?: number;
  /** Players per match: 2 = 1v1, 4 = 2v2 (ADR-002). */
  playersPerMatch?: number;
  participants: GenParticipant[];
  hasFixedTeams?: boolean;
  allowUserInMultipleTeams?: boolean;
  fixedTeams?: GenFixedTeam[];
  gameCourts?: GenGameCourt[];
  matchGenerationType?: string | null;
  genderTeams?: string;
  ballsInGames?: boolean;
  fixedNumberOfSets?: number;
  entityType: string;
  parentId?: string | null;
  leagueGroupId?: string | null;
  winnerOfGame?: WinnerOfGame;
  winnerOfMatch?: WinnerOfMatch;
  pointsPerWin?: number;
  pointsPerTie?: number;
  pointsPerLoose?: number;
  scoringPreset?: import('@prisma/client').ScoringPreset | null;
  matchTimerEnabled?: boolean | null;
  maxTotalPointsPerSet?: number | null;
  maxPointsPerTeam?: number | null;
  deucesBeforeGoldenPoint?: number | null;
}
