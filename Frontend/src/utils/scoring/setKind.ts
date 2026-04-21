import type { SetResult } from '@/types/gameResults';
import type { ScoringRules, SetKind } from './rulebook';
import { isClassicRules, isPointsRules, isTimedRules } from './rulebook';
import { countSetsWon } from './matchWinner';

export const getSetKind = (
  setIndex: number,
  sets: SetResult[],
  rules: ScoringRules,
  setBeingUpdated?: Pick<SetResult, 'teamA' | 'teamB' | 'isTieBreak'>
): SetKind => {
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
