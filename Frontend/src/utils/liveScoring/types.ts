import type { SetResult } from '@/types/gameResults';

export type LiveTeamSide = 'teamA' | 'teamB';
export type LivePointValue = 0 | 15 | 30 | 40;

export type LiveClassicPointState =
  | { kind: 'regular'; teamA: LivePointValue; teamB: LivePointValue }
  | { kind: 'deuce' }
  | { kind: 'advantage'; side: LiveTeamSide };

export type LiveScoringMode = 'classic' | 'points';

export type LiveOptionalDeciderFormat = 'REGULAR_SET' | 'SUPER_TIEBREAK';

/** Americano / super tie-break serve rotation (official = TB-style 2 points per team). */
export type LivePointsServeRotation = 'official' | 'simple';

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
  /** When true, Team A starts on the diagram top end (default: Team A bottom). XOR’d with change-of-ends history. */
  matchStartCourtEndsSwapped?: boolean;
  /** When true, Team A’s roster order is drawn left↔right on their baseline (match-start anchor). */
  matchStartTeamASidesMirrored?: boolean;
  /** When true, Team B’s roster order is drawn left↔right on their baseline (match-start anchor). */
  matchStartTeamBSidesMirrored?: boolean;
  pointsServeRotation?: LivePointsServeRotation;
  serveGuideSkipped?: boolean;
  /** Third-set (etc.) format when rules do not mandate super tie-break. */
  optionalDeciderFormat?: LiveOptionalDeciderFormat;
  /** True when the operator locked the current classic set at a partial games score (timed / buzzer). */
  timedClassicSetLocked?: boolean;
  /** Strict officiating: let called — block scoring until replay confirmed. */
  officiatingLetPending?: boolean;
  /** Rally sports (squash/badminton): winner of each completed point, in order within the active set. */
  pointWinnerLog?: LiveTeamSide[];
};

export type LiveScoringActionResult = {
  state: LiveScoringState;
  changed: boolean;
};

export type LiveMatchCourtOrientation = {
  endsSwapped: boolean;
  teamASidesMirrored: boolean;
  teamBSidesMirrored: boolean;
};
