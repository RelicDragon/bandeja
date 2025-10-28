export interface SetResult {
  teamA: number;
  teamB: number;
}

export interface Match {
  id: string;
  teamA: string[];
  teamB: string[];
  sets: SetResult[];
}

export interface Round {
  id: string;
  name: string;
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

