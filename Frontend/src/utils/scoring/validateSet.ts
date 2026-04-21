import type { SetResult } from '@/types/gameResults';
import type { ScoringRules, SetKind } from './rulebook';
import { getSetKind } from './setKind';
import { isClassicRules } from './rulebook';

export type ValidationReason =
  | 'NEGATIVE_SCORE'
  | 'EXCEEDS_TOTAL'
  | 'EXCEEDS_TEAM_MAX'
  | 'TOTAL_MISMATCH'
  | 'DRAW_NOT_ALLOWED'
  | 'CLASSIC_NEEDS_WIN_BY_2'
  | 'CLASSIC_SCORE_TOO_HIGH'
  | 'CLASSIC_SCORE_TOO_LOW_TO_WIN'
  | 'CLASSIC_INCOMPLETE'
  | 'TIEBREAK_DRAW'
  | 'TIEBREAK_WIN_BY_2'
  | 'TIEBREAK_TOO_LOW'
  | 'SUPER_TIEBREAK_DRAW'
  | 'SUPER_TIEBREAK_WIN_BY_2'
  | 'SUPER_TIEBREAK_TOO_LOW'
  | 'SET_AFTER_MATCH_DECIDED';

export interface ValidationResult {
  ok: boolean;
  reason?: ValidationReason;
  detail?: Record<string, number | string>;
  kind?: SetKind;
}

const ok = (kind: SetKind): ValidationResult => ({ ok: true, kind });

const fail = (reason: ValidationReason, detail?: Record<string, number | string>, kind?: SetKind): ValidationResult => ({
  ok: false,
  reason,
  detail,
  kind,
});

export const validateClassicRegularSet = (a: number, b: number, rules: ScoringRules): ValidationResult => {
  const target = rules.gamesPerSet;
  const winBy = rules.winBy;
  const tbAt = rules.tieBreakGameAtGames;

  if (a === b) {
    if (tbAt !== null && a === tbAt) return ok('REGULAR');
    return fail('DRAW_NOT_ALLOWED');
  }
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);

  if (hi < target) return fail('CLASSIC_SCORE_TOO_LOW_TO_WIN', { target });
  if (winBy >= 2 && tbAt !== null && hi === target + 1 && lo === tbAt) {
    return fail('CLASSIC_INCOMPLETE');
  }
  if (winBy >= 2 && hi > target + 1 && hi - lo !== 2) {
    if (hi - lo < 2) return fail('CLASSIC_NEEDS_WIN_BY_2', { diff: hi - lo });
    return fail('CLASSIC_SCORE_TOO_HIGH', { target });
  }
  if (winBy >= 2 && hi === target && lo > target - 2) return fail('CLASSIC_NEEDS_WIN_BY_2', { diff: hi - lo });
  if (winBy === 1 && hi > target && hi - lo !== 1) return fail('CLASSIC_SCORE_TOO_HIGH', { target });
  return ok('REGULAR');
};

export const validateClassicTiebreakGame = (a: number, b: number, rules: ScoringRules): ValidationResult => {
  if (a === b) return fail('TIEBREAK_DRAW');
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < rules.tieBreakGameFirstTo) return fail('TIEBREAK_TOO_LOW', { target: rules.tieBreakGameFirstTo });
  if (hi - lo < rules.tieBreakGameWinBy) return fail('TIEBREAK_WIN_BY_2', { diff: hi - lo });
  if (hi > rules.tieBreakGameFirstTo && hi - lo !== rules.tieBreakGameWinBy) {
    return fail('TIEBREAK_WIN_BY_2', { diff: hi - lo });
  }
  return ok('TIEBREAK_GAME');
};

export const validateSuperTiebreak = (a: number, b: number, rules: ScoringRules): ValidationResult => {
  if (a === b) return fail('SUPER_TIEBREAK_DRAW');
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < rules.superTieBreakFirstTo) return fail('SUPER_TIEBREAK_TOO_LOW', { target: rules.superTieBreakFirstTo });
  if (hi - lo < rules.superTieBreakWinBy) return fail('SUPER_TIEBREAK_WIN_BY_2', { diff: hi - lo });
  if (hi > rules.superTieBreakFirstTo && hi - lo !== rules.superTieBreakWinBy) {
    return fail('SUPER_TIEBREAK_WIN_BY_2', { diff: hi - lo });
  }
  return ok('SUPER_TIEBREAK');
};

export const validatePointsSet = (a: number, b: number, rules: ScoringRules): ValidationResult => {
  if (rules.totalPointsPerSet > 0 && a + b !== rules.totalPointsPerSet) {
    return fail('TOTAL_MISMATCH', { total: rules.totalPointsPerSet });
  }
  if (!rules.allowDrawPerSet && a === b && a > 0) {
    return fail('DRAW_NOT_ALLOWED');
  }
  return ok('POINTS');
};

export const validateTimedSet = (_a: number, _b: number): ValidationResult => ok('TIMED');

export const validateCustomSet = (a: number, b: number, rules: ScoringRules): ValidationResult => {
  if (rules.totalPointsPerSet > 0 && a + b > rules.totalPointsPerSet) {
    return fail('EXCEEDS_TOTAL', { total: rules.totalPointsPerSet });
  }
  return ok('CUSTOM');
};

export const isLegalSetScore = (
  a: number,
  b: number,
  rules: ScoringRules,
  setIndex: number,
  sets: SetResult[],
  isTieBreakFlag?: boolean
): ValidationResult => {
  if (a < 0 || b < 0) return fail('NEGATIVE_SCORE');

  const maxTeam = rules.maxPointsPerTeam;
  if (maxTeam > 0 && (a > maxTeam || b > maxTeam)) return fail('EXCEEDS_TEAM_MAX', { max: maxTeam });

  const kind = getSetKind(setIndex, sets, rules, { teamA: a, teamB: b, isTieBreak: isTieBreakFlag });

  if (a === 0 && b === 0) return ok(kind);

  if (kind === 'POINTS') return validatePointsSet(a, b, rules);
  if (kind === 'TIMED') return validateTimedSet(a, b);
  if (kind === 'CUSTOM') return validateCustomSet(a, b, rules);
  if (kind === 'SUPER_TIEBREAK') return validateSuperTiebreak(a, b, rules);
  if (kind === 'TIEBREAK_GAME') return validateClassicTiebreakGame(a, b, rules);

  if (isClassicRules(rules)) return validateClassicRegularSet(a, b, rules);
  return ok(kind);
};
