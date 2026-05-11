import type { SetResult } from '@/types/gameResults';

export type LiveTeamSide = 'teamA' | 'teamB';
export type LivePointValue = 0 | 15 | 30 | 40;

export type LiveClassicPointState =
  | { kind: 'regular'; teamA: LivePointValue; teamB: LivePointValue }
  | { kind: 'deuce' }
  | { kind: 'advantage'; side: LiveTeamSide };

export type LiveScoringMode = 'classic' | 'points';

export type LiveScoringClassicState = {
  pointState: LiveClassicPointState;
  withinSetTieBreak: boolean;
  tieBreakA: number;
  tieBreakB: number;
  classicPointsPlayedInGame: number;
  pendingGameWinConfirmSide?: LiveTeamSide;
};

export type LiveScoringState = {
  activeSetIndex: number;
  mode: LiveScoringMode;
  sets: SetResult[];
  classic?: LiveScoringClassicState;
  firstServerTeam?: LiveTeamSide;
  firstServerDoublesPlayerIndex?: number;
  serveGuideSkipped?: boolean;
};

export type LiveScoringActionResult = {
  state: LiveScoringState;
  changed: boolean;
  needsGameWinConfirm?: LiveTeamSide;
};
