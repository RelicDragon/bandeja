export interface SetData {
  setNumber: number;
  teamAScore: number;
  teamBScore: number;
  isTieBreak?: boolean;
}

export interface TeamData {
  teamNumber: number;
  playerIds: string[];
  score?: number;
}

export interface MatchData {
  matchNumber: number;
  teams: TeamData[];
  sets: SetData[];
  winnerId?: string;
  status?: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}

export interface RoundOutcomeData {
  userId: string;
  levelChange: number;
}

export interface RoundData {
  roundNumber: number;
  matches: MatchData[];
  status?: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  outcomes?: RoundOutcomeData[];
}

export interface GameOutcomeData {
  userId: string;
  levelChange: number;
  reliabilityChange: number;
  pointsEarned: number;
  position?: number;
  isWinner?: boolean;
  wins?: number;
  ties?: number;
  losses?: number;
  scoresMade?: number;
  scoresLost?: number;
}

export interface GameResultsPayload {
  rounds: RoundData[];
  finalOutcomes?: GameOutcomeData[];
}

