export type SetResult = {
  teamA: number;
  teamB: number;
  isTieBreak?: boolean;
  role?: string;
};

export type LiveTeamSide = 'teamA' | 'teamB';
export type LivePointValue = 0 | 15 | 30 | 40;

export type LiveClassicPointState =
  | { kind: 'regular'; teamA: LivePointValue; teamB: LivePointValue }
  | { kind: 'deuce' }
  | { kind: 'advantage'; side: LiveTeamSide };

export type LiveScoringMode = 'classic' | 'points';

export type LiveOptionalDeciderFormat = 'REGULAR_SET' | 'SUPER_TIEBREAK';

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
  matchStartCourtEndsSwapped?: boolean;
  matchStartTeamASidesMirrored?: boolean;
  matchStartTeamBSidesMirrored?: boolean;
  pointsServeRotation?: LivePointsServeRotation;
  serveGuideSkipped?: boolean;
  optionalDeciderFormat?: LiveOptionalDeciderFormat;
  timedClassicSetLocked?: boolean;
  /** Strict officiating: let called — block scoring until replay confirmed. */
  officiatingLetPending?: boolean;
  /** Rally-cap sports: winner of each point (serve rotation / squash PAR). */
  pointWinnerLog?: LiveTeamSide[];
};

export type LiveScoringActionResult = {
  state: LiveScoringState;
  changed: boolean;
};
