import type { MatchTimerSnapshot } from '@/utils/matchTimer';
import type { MatchSetRole } from '@/utils/matchSetRole';

export interface SetResult {
  id?: string;
  teamA: number;
  teamB: number;
  isTieBreak?: boolean;
  role?: MatchSetRole;
}

export interface Match {
  id: string;
  teamA: string[];
  teamB: string[];
  sets: SetResult[];
  winnerId?: 'teamA' | 'teamB' | null;
  courtId?: string;
  fixedTeamIdA?: string;
  fixedTeamIdB?: string;
  timer?: MatchTimerSnapshot;
}

export interface Round {
  id: string;
  matches: Match[];
}

export type GameStateType = 
  | 'ACCESS_DENIED' 
  | 'GAME_ARCHIVED' 
  | 'GAME_NOT_STARTED' 
  | 'INSUFFICIENT_PLAYERS' 
  | 'NO_RESULTS' 
  | 'HAS_RESULTS';

export interface GameState {
  type: GameStateType;
  message: string;
  canEdit: boolean;
  showInputs: boolean;
  showClock: boolean;
}

