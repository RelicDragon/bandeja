import { ScoringPreset, WinnerOfMatch } from '@prisma/client';

type ClassicGameRules = {
  gamesPerSet: number;
  winBy: number;
  tieBreakGameAtGames: number | null;
  superTieBreakReplacesDeciderAtIndex: number | null;
  superTieBreakFirstTo: number;
  superTieBreakWinBy: number;
  tieBreakGameFirstTo: number;
  tieBreakGameWinBy: number;
};

const classicBo3: ClassicGameRules = {
  gamesPerSet: 6,
  winBy: 2,
  tieBreakGameAtGames: 6,
  superTieBreakReplacesDeciderAtIndex: null,
  superTieBreakFirstTo: 10,
  superTieBreakWinBy: 2,
  tieBreakGameFirstTo: 7,
  tieBreakGameWinBy: 2,
};

const PRESET_RULES: Partial<Record<ScoringPreset, ClassicGameRules>> = {
  CLASSIC_BEST_OF_3: classicBo3,
  CLASSIC_BEST_OF_5: { ...classicBo3, superTieBreakReplacesDeciderAtIndex: null },
  CLASSIC_SUPER_TIEBREAK: { ...classicBo3, superTieBreakReplacesDeciderAtIndex: 2 },
  CLASSIC_PRO_SET: {
    ...classicBo3,
    gamesPerSet: 9,
    tieBreakGameAtGames: 8,
    superTieBreakReplacesDeciderAtIndex: null,
  },
  CLASSIC_SHORT_SET: { ...classicBo3, gamesPerSet: 4, tieBreakGameAtGames: 3 },
  CLASSIC_TIMED: { ...classicBo3 },
};

function deriveClassicRules(params: {
  scoringPreset: ScoringPreset | null;
  fixedNumberOfSets: number;
  ballsInGames: boolean;
  winnerOfMatch: WinnerOfMatch;
}): ClassicGameRules | null {
  if (!params.ballsInGames || params.winnerOfMatch !== WinnerOfMatch.BY_SETS) {
    return null;
  }
  if (params.scoringPreset && PRESET_RULES[params.scoringPreset]) {
    return PRESET_RULES[params.scoringPreset]!;
  }
  const n = Math.max(0, params.fixedNumberOfSets);
  if (n === 5) return PRESET_RULES.CLASSIC_BEST_OF_5!;
  if (n === 1) return PRESET_RULES.CLASSIC_PRO_SET!;
  return PRESET_RULES.CLASSIC_BEST_OF_3!;
}

export function validateClassicRegularGames(a: number, b: number, r: ClassicGameRules): string | null {
  const target = r.gamesPerSet;
  const winBy = r.winBy;
  const tbAt = r.tieBreakGameAtGames;

  if (a === b) {
    if (tbAt !== null && a === tbAt) return null;
    return 'Set score cannot be a draw';
  }
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);

  if (hi < target) return `A team must reach at least ${target} games to win the set`;

  if (winBy >= 2 && tbAt !== null && hi === tbAt + 1 && lo === tbAt) {
    return null;
  }

  if (winBy >= 2 && hi > target + 1 && hi - lo !== 2) {
    if (hi - lo < 2) return 'Set must be won by 2 games';
    return 'Invalid classic set score';
  }
  if (winBy >= 2 && hi === target && lo > target - 2) {
    return 'Set must be won by 2 games';
  }
  if (winBy === 1 && hi > target && hi - lo !== 1) {
    return 'Invalid classic set score';
  }
  return null;
}

function validateTiebreakPoints(a: number, b: number, firstTo: number, winBy: number): string | null {
  if (a === b) return 'Tiebreak cannot be a draw';
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < firstTo) return 'Tiebreak score too low';
  if (hi - lo < winBy) return 'Tiebreak must be won by 2 clear points';
  if (hi > firstTo && hi - lo !== winBy) return 'Tiebreak must be won by 2 clear points';
  return null;
}

function countSetWins(
  sets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean }>,
  upToExclusive: number
): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (let i = 0; i < upToExclusive; i++) {
    const s = sets[i];
    if (!s || (s.teamA === 0 && s.teamB === 0)) continue;
    if (s.teamA === s.teamB) continue;
    if (s.teamA > s.teamB) a++;
    else b++;
  }
  return { a, b };
}

function isSuperTiebreakDeciderRow(
  setIndex: number,
  rules: ClassicGameRules,
  sets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean }>
): boolean {
  const idx = rules.superTieBreakReplacesDeciderAtIndex;
  if (idx === null || setIndex !== idx) return false;
  const { a, b } = countSetWins(sets, setIndex);
  return a === b && a > 0;
}

export function validateMatchClassicSetScores(
  game: {
    scoringPreset: ScoringPreset | null;
    fixedNumberOfSets: number;
    ballsInGames: boolean;
    winnerOfMatch: WinnerOfMatch;
  },
  sets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean }>
): string | null {
  const rules = deriveClassicRules(game);
  if (!rules) return null;

  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    const ta = s.teamA ?? 0;
    const tb = s.teamB ?? 0;
    if (ta === 0 && tb === 0) continue;

    if (s.isTieBreak) {
      if (isSuperTiebreakDeciderRow(i, rules, sets)) {
        const err = validateTiebreakPoints(ta, tb, rules.superTieBreakFirstTo, rules.superTieBreakWinBy);
        if (err) return `Set ${i + 1}: ${err}`;
      } else {
        const err = validateTiebreakPoints(ta, tb, rules.tieBreakGameFirstTo, rules.tieBreakGameWinBy);
        if (err) return `Set ${i + 1}: ${err}`;
      }
    } else {
      if (game.scoringPreset === ScoringPreset.CLASSIC_TIMED) continue;
      const err = validateClassicRegularGames(ta, tb, rules);
      if (err) return `Set ${i + 1}: ${err}`;
    }
  }
  return null;
}
