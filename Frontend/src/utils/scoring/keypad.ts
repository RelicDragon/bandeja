import type { SetResult } from '@/types/gameResults';
import type { ScoringRules, SetKind } from './rulebook';
import { getSetKind } from './setKind';
import { isClassicRules, isClassicTimedRelaxedGameScores, isPointsRules } from './rulebook';

export interface KeypadOptions {
  values: number[];
  mode: 'FREE' | 'PAIRED' | 'CLASSIC' | 'TIEBREAK' | 'SUPER_TIEBREAK';
  max: number;
  pairedTotal?: number;
  kind: SetKind;
  forbiddenForOtherTeam?: number[];
}

const classicRegularValues = (rules: ScoringRules): number[] => {
  const target = rules.gamesPerSet;
  const maxVal = rules.tieBreakGameAtGames !== null ? target + 1 : target;
  return Array.from({ length: maxVal + 1 }, (_, i) => i);
};

const range = (max: number): number[] => Array.from({ length: Math.max(0, max + 1) }, (_, i) => i);

export const getKeypadOptions = (
  rules: ScoringRules,
  setIndex: number,
  sets: SetResult[],
  isTieBreakFlag?: boolean
): KeypadOptions => {
  const kind = getSetKind(setIndex, sets, rules, { teamA: 0, teamB: 0, isTieBreak: isTieBreakFlag });

  if (kind === 'POINTS' || (isPointsRules(rules) && kind !== 'SUPER_TIEBREAK' && kind !== 'TIEBREAK_GAME')) {
    const total = rules.totalPointsPerSet;
    return {
      values: range(total),
      mode: 'PAIRED',
      max: total,
      pairedTotal: total,
      kind: 'POINTS',
    };
  }

  if (kind === 'TIMED') {
    const max = rules.maxPointsPerTeam > 0 ? rules.maxPointsPerTeam : 99;
    return { values: range(max), mode: 'FREE', max, kind: 'TIMED' };
  }

  if (kind === 'SUPER_TIEBREAK') {
    const target = rules.superTieBreakFirstTo;
    const max = Math.max(target + 5, target);
    return { values: range(max), mode: 'SUPER_TIEBREAK', max, kind: 'SUPER_TIEBREAK' };
  }

  if (kind === 'TIEBREAK_GAME') {
    const max = rules.gamesPerSet + 1;
    return { values: range(max), mode: 'CLASSIC', max, kind: 'TIEBREAK_GAME' };
  }

  if (isClassicRules(rules) && isClassicTimedRelaxedGameScores(rules) && kind === 'REGULAR') {
    const max = rules.maxPointsPerTeam > 0 ? rules.maxPointsPerTeam : 99;
    return { values: range(max), mode: 'FREE', max, kind: 'REGULAR' };
  }

  if (isClassicRules(rules)) {
    return {
      values: classicRegularValues(rules),
      mode: 'CLASSIC',
      max: rules.tieBreakGameAtGames !== null ? rules.gamesPerSet + 1 : rules.gamesPerSet,
      kind: 'REGULAR',
    };
  }

  const max = rules.maxPointsPerTeam > 0 ? rules.maxPointsPerTeam : 48;
  return { values: range(max), mode: 'FREE', max, kind: 'CUSTOM' };
};
