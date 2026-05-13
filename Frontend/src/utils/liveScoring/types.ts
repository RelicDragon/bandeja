import type { SetResult } from '@/types/gameResults';

export type LiveTeamSide = 'teamA' | 'teamB';
export type LivePointValue = 0 | 15 | 30 | 40;

export type LiveClassicPointState =
  | { kind: 'regular'; teamA: LivePointValue; teamB: LivePointValue }
  | { kind: 'deuce' }
  | { kind: 'advantage'; side: LiveTeamSide };

export type LiveScoringMode = 'classic' | 'points';

export type LiveOptionalDeciderFormat = 'REGULAR_SET' | 'SUPER_TIEBREAK';

export type LiveScoringClassicState = {
  pointState: LiveClassicPointState;
  withinSetTieBreak: boolean;
  tieBreakA: number;
  tieBreakB: number;
  classicPointsPlayedInGame: number;
};

export type LiveScoringState = {
  activeSetIndex: number;
  mode: LiveScoringMode;
  sets: SetResult[];
  classic?: LiveScoringClassicState;
  firstServerTeam?: LiveTeamSide;
  firstServerDoublesPlayerIndex?: number;
  serveGuideSkipped?: boolean;
  /** Third-set (etc.) format when rules do not mandate super tie-break. */
  optionalDeciderFormat?: LiveOptionalDeciderFormat;
  /** True when the operator locked the current classic set at a partial games score (timed / buzzer). */
  timedClassicSetLocked?: boolean;
};

export type LiveScoringActionResult = {
  state: LiveScoringState;
  changed: boolean;
};
