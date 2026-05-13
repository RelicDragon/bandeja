import type { ScoringRules, SetKind } from './rulebook';
import {
  isClassicRules,
  isClassicTimedRelaxedGameScores,
  isPointsRules,
  isTimedRules,
} from './rulebook';
import type { SetResult } from './types';

export type MatchWinnerSide = 'A' | 'B' | null;

const isSetPlayed = (set: SetResult): boolean => set.teamA > 0 || set.teamB > 0;

const isOfficialLiveMatchSet = (set: SetResult): boolean => !set.role || set.role === 'OFFICIAL';

const isSupplementalLiveSet = (set: SetResult): boolean =>
  set.role === 'EXTRA_GAMES' || set.role === 'EXTRA_BALLS';

const setWinner = (set: SetResult): MatchWinnerSide => {
  if (!isSetPlayed(set)) return null;
  if (set.teamA > set.teamB) return 'A';
  if (set.teamB > set.teamA) return 'B';
  return null;
};

const countSetsWon = (sets: SetResult[]): { a: number; b: number } => {
  let a = 0;
  let b = 0;
  for (const set of sets) {
    if (!isOfficialLiveMatchSet(set)) continue;
    const w = setWinner(set);
    if (w === 'A') a += 1;
    else if (w === 'B') b += 1;
  }
  return { a, b };
};

const getSetKind = (
  setIndex: number,
  sets: SetResult[],
  rules: ScoringRules,
  setBeingUpdated?: Pick<SetResult, 'teamA' | 'teamB' | 'isTieBreak'>
): SetKind => {
  const row = sets[setIndex];
  if (row && isSupplementalLiveSet(row)) return 'CUSTOM';
  if (isPointsRules(rules)) return 'POINTS';
  if (isTimedRules(rules)) return 'TIMED';
  if (!isClassicRules(rules)) return 'CUSTOM';

  const effective = sets.map((s, i) => (i === setIndex && setBeingUpdated ? { ...s, ...setBeingUpdated } : s));
  const current = effective[setIndex] ?? { teamA: 0, teamB: 0, isTieBreak: false };

  if (rules.superTieBreakReplacesDeciderAtIndex !== null && setIndex === rules.superTieBreakReplacesDeciderAtIndex) {
    const priorPlayed = effective.slice(0, setIndex).filter(s => s.teamA > 0 || s.teamB > 0);
    if (priorPlayed.length === setIndex) {
      const { a, b } = countSetsWon(priorPlayed);
      if (a === b && a >= setIndex / 2) return 'SUPER_TIEBREAK';
    }
    if (current.isTieBreak) return 'SUPER_TIEBREAK';
  }

  if (current.isTieBreak) return 'TIEBREAK_GAME';

  return 'REGULAR';
};

type ValidationResult = { ok: boolean };

const ok = (_kind: SetKind): ValidationResult => ({ ok: true });

const validateClassicRegularSet = (a: number, b: number, rules: ScoringRules): ValidationResult => {
  const target = rules.gamesPerSet;
  const winBy = rules.winBy;
  const tbAt = rules.tieBreakGameAtGames;

  if (a === b) {
    if (tbAt !== null && a === tbAt) return ok('REGULAR');
    return { ok: false };
  }
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);

  if (hi < target) return { ok: false };
  if (winBy >= 2 && tbAt !== null && hi === tbAt + 1 && lo === tbAt) {
    return ok('REGULAR');
  }
  if (winBy >= 2 && hi > target + 1 && hi - lo !== 2) {
    return { ok: false };
  }
  if (winBy >= 2 && hi === target && lo > target - 2) return { ok: false };
  if (winBy === 1 && hi > target && hi - lo !== 1) return { ok: false };
  return ok('REGULAR');
};

const validateClassicTiebreakGame = (a: number, b: number, rules: ScoringRules): ValidationResult => {
  if (a === b) return { ok: false };
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < rules.tieBreakGameFirstTo) return { ok: false };
  if (hi - lo < rules.tieBreakGameWinBy) return { ok: false };
  if (hi > rules.tieBreakGameFirstTo && hi - lo !== rules.tieBreakGameWinBy) {
    return { ok: false };
  }
  return ok('TIEBREAK_GAME');
};

const validateSuperTiebreak = (a: number, b: number, rules: ScoringRules): ValidationResult => {
  if (a === b) return { ok: false };
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < rules.superTieBreakFirstTo) return { ok: false };
  if (hi - lo < rules.superTieBreakWinBy) return { ok: false };
  if (hi > rules.superTieBreakFirstTo && hi - lo !== rules.superTieBreakWinBy) {
    return { ok: false };
  }
  return ok('SUPER_TIEBREAK');
};

const validatePointsSet = (a: number, b: number, rules: ScoringRules): ValidationResult => {
  if (rules.totalPointsPerSet > 0 && a + b !== rules.totalPointsPerSet) {
    return { ok: false };
  }
  if (!rules.allowDrawPerSet && a === b && a > 0) {
    return { ok: false };
  }
  return ok('POINTS');
};

const validateTimedSet = (): ValidationResult => ({ ok: true });

const validateCustomSet = (a: number, b: number, rules: ScoringRules): ValidationResult => {
  if (rules.totalPointsPerSet > 0 && a + b > rules.totalPointsPerSet) {
    return { ok: false };
  }
  return ok('CUSTOM');
};

const isLegalSetScore = (
  a: number,
  b: number,
  rules: ScoringRules,
  setIndex: number,
  sets: SetResult[],
  isTieBreakFlag?: boolean
): ValidationResult => {
  if (a < 0 || b < 0) return { ok: false };

  const maxTeam = rules.maxPointsPerTeam;
  if (maxTeam > 0 && (a > maxTeam || b > maxTeam)) return { ok: false };

  const kind = getSetKind(setIndex, sets, rules, { teamA: a, teamB: b, isTieBreak: isTieBreakFlag });

  if (a === 0 && b === 0) return ok(kind);

  if (kind === 'POINTS') return validatePointsSet(a, b, rules);
  if (kind === 'TIMED') return validateTimedSet();
  if (kind === 'CUSTOM') return validateCustomSet(a, b, rules);
  if (kind === 'SUPER_TIEBREAK') return validateSuperTiebreak(a, b, rules);
  if (kind === 'TIEBREAK_GAME') return validateClassicTiebreakGame(a, b, rules);

  if (isClassicRules(rules)) {
    if (isClassicTimedRelaxedGameScores(rules) && kind === 'REGULAR') return validateTimedSet();
    return validateClassicRegularSet(a, b, rules);
  }
  return ok(kind);
};

const completedOfficialSetsForLive = (sets: SetResult[], rules: ScoringRules): SetResult[] => {
  const out: SetResult[] = [];
  for (let i = 0; i < sets.length; i += 1) {
    const set = sets[i];
    if (!isOfficialLiveMatchSet(set) || !isSetPlayed(set)) continue;
    if (!isLegalSetScore(set.teamA, set.teamB, rules, i, sets, set.isTieBreak).ok) continue;
    out.push(set);
  }
  return out;
};

export const computeMatchWinnerLiveScoring = (sets: SetResult[], rules: ScoringRules): MatchWinnerSide => {
  const playedSets = completedOfficialSetsForLive(sets, rules);
  if (playedSets.length === 0) return null;

  if (rules.winnerOfMatch === 'BY_SETS') {
    let a = 0;
    let b = 0;
    for (const set of playedSets) {
      const w = setWinner(set);
      if (w === 'A') a += 1;
      else if (w === 'B') b += 1;
    }
    if (a >= rules.minSetsToWin) return 'A';
    if (b >= rules.minSetsToWin) return 'B';
    if (a === b) return null;
    const anyBallOfficial = sets.filter(isOfficialLiveMatchSet).filter(isSetPlayed).length;
    if (rules.fixedNumberOfSets > 0 && anyBallOfficial >= rules.fixedNumberOfSets) {
      return a > b ? 'A' : 'B';
    }
    return null;
  }

  let a = 0;
  let b = 0;
  for (const set of playedSets) {
    a += set.teamA;
    b += set.teamB;
  }
  if (a > b) return 'A';
  if (b > a) return 'B';
  return null;
};

export const isMatchDecidedForLiveScoring = (sets: SetResult[], rules: ScoringRules): boolean =>
  computeMatchWinnerLiveScoring(sets, rules) !== null;
