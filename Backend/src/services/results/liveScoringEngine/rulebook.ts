import { getOfficiatingLevelForGame } from '../../../sport/sportRegistryCasual';
import type { Sport } from '../../../sport/sportIds';
import type { OfficiatingLevel } from '../../../shared/officiatingLevel';
import { getStrictValidationForPreset, type StrictValidationId } from '../../../shared/sportPresetMeta';

export type ScoringPreset =
  | 'CLASSIC_BEST_OF_3'
  | 'CLASSIC_BEST_OF_5'
  | 'CLASSIC_PRO_SET'
  | 'CLASSIC_SHORT_SET'
  | 'CLASSIC_FAST4'
  | 'CLASSIC_SUPER_TIEBREAK'
  | 'CLASSIC_SINGLE_SET'
  | 'CLASSIC_TIMED'
  | 'POINTS_11'
  | 'POINTS_12'
  | 'POINTS_15'
  | 'POINTS_16'
  | 'POINTS_21'
  | 'POINTS_24'
  | 'POINTS_32'
  | 'BEST_OF_3_11'
  | 'BEST_OF_3_15'
  | 'BEST_OF_3_21'
  | 'BEST_OF_5_11'
  | 'PAR_11'
  | 'SINGLE_GAME_21'
  | 'TIMED'
  | 'CUSTOM';

export type WinnerOfMatch = 'BY_SETS' | 'BY_SCORES';

export type SetKind = 'REGULAR' | 'TIEBREAK_GAME' | 'SUPER_TIEBREAK' | 'POINTS' | 'TIMED' | 'CUSTOM';

export interface ScoringRules {
  preset: ScoringPreset | 'DERIVED';
  ballsInGames: boolean;
  fixedNumberOfSets: number;
  minSetsToWin: number;
  maxSetsPlayed: number;

  gamesPerSet: number;
  winBy: number;
  tieBreakGameAtGames: number | null;
  tieBreakGameFirstTo: number;
  tieBreakGameWinBy: number;

  superTieBreakReplacesDeciderAtIndex: number | null;
  superTieBreakFirstTo: number;
  superTieBreakWinBy: number;

  totalPointsPerSet: number;
  maxPointsPerTeam: number;
  winnerOfMatch: WinnerOfMatch;

  allowDrawPerSet: boolean;
  hasGoldenPoint: boolean;
  allowRemoveSet: boolean;
  /** Incomplete regular set games (e.g. at buzzer) when match timer is on or legacy timed preset. */
  allowIncompleteRegularSetGames: boolean;
  strictValidation: StrictValidationId;
  officiatingLevel: OfficiatingLevel;
}

type RuleSkeleton = Omit<
  ScoringRules,
  | 'preset'
  | 'hasGoldenPoint'
  | 'allowDrawPerSet'
  | 'maxPointsPerTeam'
  | 'allowIncompleteRegularSetGames'
  | 'strictValidation'
  | 'officiatingLevel'
>;

const classicBo3: RuleSkeleton = {
  ballsInGames: true,
  fixedNumberOfSets: 3,
  minSetsToWin: 2,
  maxSetsPlayed: 3,
  gamesPerSet: 6,
  winBy: 2,
  tieBreakGameAtGames: 6,
  tieBreakGameFirstTo: 7,
  tieBreakGameWinBy: 2,
  superTieBreakReplacesDeciderAtIndex: null,
  superTieBreakFirstTo: 10,
  superTieBreakWinBy: 2,
  totalPointsPerSet: 0,
  winnerOfMatch: 'BY_SETS',
  allowRemoveSet: false,
};

const classicBo5: RuleSkeleton = {
  ...classicBo3,
  fixedNumberOfSets: 5,
  minSetsToWin: 3,
  maxSetsPlayed: 5,
};

const classicSuperTb: RuleSkeleton = {
  ...classicBo3,
  superTieBreakReplacesDeciderAtIndex: 2,
};

const classicProSet: RuleSkeleton = {
  ...classicBo3,
  fixedNumberOfSets: 1,
  minSetsToWin: 1,
  maxSetsPlayed: 1,
  gamesPerSet: 9,
  tieBreakGameAtGames: 8,
};

const classicShortSet: RuleSkeleton = {
  ...classicBo3,
  gamesPerSet: 4,
  tieBreakGameAtGames: 3,
};

const classicFast4: RuleSkeleton = {
  ...classicBo3,
  gamesPerSet: 4,
  tieBreakGameAtGames: 3,
  tieBreakGameFirstTo: 5,
};

/** One standard set (6 games, TB at 6–6); used for timer-capped tennis matches. */
const classicTimedMatch: RuleSkeleton = {
  ballsInGames: true,
  fixedNumberOfSets: 1,
  minSetsToWin: 1,
  maxSetsPlayed: 1,
  gamesPerSet: 6,
  winBy: 2,
  tieBreakGameAtGames: 6,
  tieBreakGameFirstTo: 7,
  tieBreakGameWinBy: 2,
  superTieBreakReplacesDeciderAtIndex: null,
  superTieBreakFirstTo: 10,
  superTieBreakWinBy: 2,
  totalPointsPerSet: 0,
  winnerOfMatch: 'BY_SETS',
  allowRemoveSet: false,
};

const pointsRule = (total: number, winBy = 0): RuleSkeleton => ({
  ballsInGames: false,
  fixedNumberOfSets: 1,
  minSetsToWin: 1,
  maxSetsPlayed: 1,
  gamesPerSet: 0,
  winBy,
  tieBreakGameAtGames: null,
  tieBreakGameFirstTo: 0,
  tieBreakGameWinBy: 0,
  superTieBreakReplacesDeciderAtIndex: null,
  superTieBreakFirstTo: 0,
  superTieBreakWinBy: 0,
  totalPointsPerSet: total,
  winnerOfMatch: 'BY_SCORES',
  allowRemoveSet: false,
});

const rallyPointsRule = (total: number): RuleSkeleton => pointsRule(total, 2);

const rallyBestOf = (sets: number, pointsPerSet: number): RuleSkeleton => ({
  ballsInGames: false,
  fixedNumberOfSets: sets,
  minSetsToWin: Math.ceil(sets / 2),
  maxSetsPlayed: sets,
  gamesPerSet: 0,
  winBy: 2,
  tieBreakGameAtGames: null,
  tieBreakGameFirstTo: 0,
  tieBreakGameWinBy: 0,
  superTieBreakReplacesDeciderAtIndex: null,
  superTieBreakFirstTo: 0,
  superTieBreakWinBy: 0,
  totalPointsPerSet: pointsPerSet,
  winnerOfMatch: 'BY_SETS',
  allowRemoveSet: false,
});

const timedRule: RuleSkeleton = {
  ...pointsRule(0),
};

const customRule: RuleSkeleton = {
  ...pointsRule(0),
  fixedNumberOfSets: 0,
  maxSetsPlayed: 99,
  allowRemoveSet: true,
};

const PRESETS: Record<ScoringPreset, RuleSkeleton> = {
  CLASSIC_BEST_OF_3: classicBo3,
  CLASSIC_BEST_OF_5: classicBo5,
  CLASSIC_SUPER_TIEBREAK: classicSuperTb,
  CLASSIC_PRO_SET: classicProSet,
  CLASSIC_SINGLE_SET: classicTimedMatch,
  CLASSIC_SHORT_SET: classicShortSet,
  CLASSIC_FAST4: classicFast4,
  CLASSIC_TIMED: classicTimedMatch,
  POINTS_11: rallyPointsRule(11),
  POINTS_12: pointsRule(12),
  POINTS_15: pointsRule(15),
  POINTS_16: pointsRule(16),
  POINTS_21: pointsRule(21),
  POINTS_24: pointsRule(24),
  POINTS_32: pointsRule(32),
  BEST_OF_3_11: rallyBestOf(3, 11),
  BEST_OF_3_15: rallyBestOf(3, 15),
  BEST_OF_3_21: rallyBestOf(3, 21),
  BEST_OF_5_11: rallyBestOf(5, 11),
  PAR_11: rallyPointsRule(11),
  SINGLE_GAME_21: rallyPointsRule(21),
  TIMED: timedRule,
  CUSTOM: customRule,
};

type RulesSource =
  | Partial<
      Pick<
        {
          scoringPreset: ScoringPreset | null;
          sport: string | null;
          fixedNumberOfSets: number | null;
          maxTotalPointsPerSet: number | null;
          maxPointsPerTeam: number | null;
          winnerOfMatch: WinnerOfMatch | null;
          ballsInGames: boolean | null;
          hasGoldenPoint: boolean | null;
          pointsPerTie: number | null;
          matchTimerEnabled: boolean | null;
          metadata?: unknown;
        },
        | 'scoringPreset'
        | 'sport'
        | 'fixedNumberOfSets'
        | 'maxTotalPointsPerSet'
        | 'maxPointsPerTeam'
        | 'winnerOfMatch'
        | 'ballsInGames'
        | 'hasGoldenPoint'
        | 'pointsPerTie'
        | 'matchTimerEnabled'
        | 'metadata'
      >
    >
  | null
  | undefined;

export const getRulesFromPreset = (preset: ScoringPreset): RuleSkeleton => PRESETS[preset];

export const getRules = (game: RulesSource): ScoringRules => {
  const preset = game?.scoringPreset ?? null;
  const base: RuleSkeleton = preset ? PRESETS[preset] : deriveFromGame(game);
  const allowDrawPerSet = !preset
    ? (game?.pointsPerTie ?? 0) > 0
    : base.winnerOfMatch === 'BY_SCORES' &&
      ((game?.pointsPerTie ?? 0) > 0 || (!base.ballsInGames && base.totalPointsPerSet > 0));

  const goldenApplies = base.ballsInGames && base.winnerOfMatch === 'BY_SETS';

  const strictValidation = getStrictValidationForPreset(game?.sport, preset);
  const allowIncompleteRegularSetGames =
    Boolean(game?.matchTimerEnabled) ||
    preset === 'CLASSIC_TIMED' ||
    strictValidation === 'CLASSIC_TIMED_RELAXED';

  return {
    ...base,
    preset: preset ?? 'DERIVED',
    allowDrawPerSet,
    hasGoldenPoint:
      goldenApplies &&
      (game?.hasGoldenPoint ?? (preset === 'CLASSIC_FAST4' ? true : false)),
    maxPointsPerTeam: game?.maxPointsPerTeam ?? 0,
    allowIncompleteRegularSetGames,
    strictValidation,
    officiatingLevel: game?.sport
      ? getOfficiatingLevelForGame(game.sport as Sport, preset, game.metadata)
      : 'none',
  };
};

const deriveFromGame = (game: RulesSource): RuleSkeleton => {
  const fixedNumberOfSets = Math.max(0, game?.fixedNumberOfSets ?? 0);
  const totalPointsPerSet = Math.max(0, game?.maxTotalPointsPerSet ?? 0);
  const ballsInGames = !!game?.ballsInGames;
  const winnerOfMatch = (game?.winnerOfMatch as WinnerOfMatch) ?? 'BY_SCORES';

  if (ballsInGames && winnerOfMatch === 'BY_SETS') {
    if (fixedNumberOfSets === 5) return classicBo5;
    if (fixedNumberOfSets === 1) return classicProSet;
    return classicBo3;
  }

  if (!ballsInGames && totalPointsPerSet > 0) {
    return pointsRule(totalPointsPerSet);
  }

  if (!ballsInGames && fixedNumberOfSets <= 1) {
    return timedRule;
  }

  return {
    ...customRule,
    fixedNumberOfSets,
    maxSetsPlayed: fixedNumberOfSets > 0 ? fixedNumberOfSets : 99,
    totalPointsPerSet,
    ballsInGames,
    winnerOfMatch,
  };
};

export const isClassicRules = (rules: ScoringRules): boolean => rules.ballsInGames && rules.winnerOfMatch === 'BY_SETS';

export const isRallyGameRules = (rules: ScoringRules): boolean =>
  !rules.ballsInGames &&
  rules.winnerOfMatch === 'BY_SETS' &&
  rules.fixedNumberOfSets > 1 &&
  rules.totalPointsPerSet > 0 &&
  rules.winBy >= 2;

export const isRallyPointsRules = (rules: ScoringRules): boolean =>
  !rules.ballsInGames &&
  rules.fixedNumberOfSets <= 1 &&
  rules.totalPointsPerSet > 0 &&
  rules.winBy >= 2;

export const isPointsRules = (rules: ScoringRules): boolean =>
  !rules.ballsInGames && rules.totalPointsPerSet > 0 && rules.winBy === 0 && rules.winnerOfMatch === 'BY_SCORES';
export const isTimedRules = (rules: ScoringRules): boolean => !rules.ballsInGames && rules.totalPointsPerSet === 0 && rules.winnerOfMatch === 'BY_SCORES' && rules.fixedNumberOfSets === 1;

/** Timed one-set classic: any non-negative games score (e.g. at buzzer) except tiebreak rows stay strict. */
export const isClassicTimedRelaxedGameScores = (rules: ScoringRules): boolean =>
  rules.allowIncompleteRegularSetGames === true;
