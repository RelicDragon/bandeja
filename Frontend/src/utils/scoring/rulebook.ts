import { Game, ScoringPreset, WinnerOfMatch } from '@/types';

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
}

type RuleSkeleton = Omit<ScoringRules, 'preset' | 'hasGoldenPoint' | 'allowDrawPerSet' | 'maxPointsPerTeam'>;

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

const pointsRule = (total: number): RuleSkeleton => ({
  ballsInGames: false,
  fixedNumberOfSets: 1,
  minSetsToWin: 1,
  maxSetsPlayed: 1,
  gamesPerSet: 0,
  winBy: 0,
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
  CLASSIC_SHORT_SET: classicShortSet,
  CLASSIC_TIMED: classicTimedMatch,
  POINTS_16: pointsRule(16),
  POINTS_21: pointsRule(21),
  POINTS_24: pointsRule(24),
  POINTS_32: pointsRule(32),
  TIMED: timedRule,
  CUSTOM: customRule,
};

type RulesSource = Pick<
  Game,
  | 'scoringPreset'
  | 'fixedNumberOfSets'
  | 'maxTotalPointsPerSet'
  | 'maxPointsPerTeam'
  | 'winnerOfMatch'
  | 'ballsInGames'
  | 'hasGoldenPoint'
  | 'pointsPerTie'
> | null | undefined;

export const getRulesFromPreset = (preset: ScoringPreset): RuleSkeleton => PRESETS[preset];

export const getRules = (game: RulesSource): ScoringRules => {
  const preset = game?.scoringPreset ?? null;
  const base: RuleSkeleton = preset ? PRESETS[preset] : deriveFromGame(game);
  const allowDrawPerSet = !preset
    ? (game?.pointsPerTie ?? 0) > 0
    : base.winnerOfMatch === 'BY_SCORES' && (game?.pointsPerTie ?? 0) > 0 && base.totalPointsPerSet === 0;

  const goldenApplies = base.ballsInGames && base.winnerOfMatch === 'BY_SETS';

  return {
    ...base,
    preset: preset ?? 'DERIVED',
    allowDrawPerSet,
    hasGoldenPoint: goldenApplies && !!game?.hasGoldenPoint,
    maxPointsPerTeam: game?.maxPointsPerTeam ?? 0,
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
export const isPointsRules = (rules: ScoringRules): boolean => !rules.ballsInGames && rules.totalPointsPerSet > 0;
export const isTimedRules = (rules: ScoringRules): boolean => !rules.ballsInGames && rules.totalPointsPerSet === 0 && rules.winnerOfMatch === 'BY_SCORES' && rules.fixedNumberOfSets === 1;
