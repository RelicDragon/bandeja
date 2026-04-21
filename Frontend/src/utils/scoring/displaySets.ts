import type { SetResult } from '@/types/gameResults';
import type { ScoringRules } from './rulebook';
import { isClassicRules, isPointsRules, isTimedRules } from './rulebook';
import { computeMatchWinner, countSetsWon } from './matchWinner';

const emptySet = (isTieBreak = false): SetResult => ({ teamA: 0, teamB: 0, isTieBreak });

const isScored = (set: SetResult | undefined): boolean => !!set && (set.teamA > 0 || set.teamB > 0);

export const initialSetsForRules = (rules: ScoringRules): SetResult[] => {
  if (isPointsRules(rules) || isTimedRules(rules)) {
    return [emptySet()];
  }
  if (isClassicRules(rules)) {
    if (rules.fixedNumberOfSets === 1) return [emptySet()];
    const shown = Math.max(1, rules.minSetsToWin);
    return Array.from({ length: shown }, () => emptySet());
  }
  if (rules.fixedNumberOfSets > 0) {
    return Array.from({ length: rules.fixedNumberOfSets }, () => emptySet());
  }
  return [emptySet()];
};

export const expandSetsForDisplay = (
  sets: SetResult[],
  rules: ScoringRules,
  options: { canEnterScores: boolean }
): SetResult[] => {
  if (isPointsRules(rules) || isTimedRules(rules)) {
    const existing = sets[0] ?? emptySet();
    return [existing];
  }

  if (isClassicRules(rules)) {
    const decided = computeMatchWinner(sets, rules) !== null;
    const base = [...sets];
    const scoredCount = base.filter(isScored).length;

    const minVisible = rules.fixedNumberOfSets === 1 ? 1 : Math.max(rules.minSetsToWin, 1);
    while (base.length < minVisible) base.push(emptySet());

    if (decided) {
      const trimmed: SetResult[] = [];
      for (const s of base) {
        if (isScored(s)) trimmed.push(s);
      }
      if (trimmed.length === 0) return base.slice(0, minVisible);
      return trimmed;
    }

    const cap = rules.fixedNumberOfSets > 0 ? rules.fixedNumberOfSets : Math.max(minVisible, base.length);
    if (options.canEnterScores && scoredCount >= minVisible && base.length < cap) {
      const { a, b } = countSetsWon(base);
      if (a === b) {
        const isSuperTb =
          rules.superTieBreakReplacesDeciderAtIndex !== null &&
          base.length === rules.superTieBreakReplacesDeciderAtIndex;
        base.push(emptySet(isSuperTb));
      }
    }

    return base;
  }

  if (rules.fixedNumberOfSets > 0) {
    const base = [...sets];
    while (base.length < rules.fixedNumberOfSets) base.push(emptySet());
    return base.slice(0, rules.fixedNumberOfSets);
  }

  const base = [...sets];
  if (options.canEnterScores) {
    if (base.length === 0) base.push(emptySet());
    else {
      const last = base[base.length - 1];
      if (isScored(last) && !last.isTieBreak) base.push(emptySet());
    }
  } else if (base.length > 0) {
    const last = base[base.length - 1];
    if (isScored(last) && !last.isTieBreak) base.push(emptySet());
  }
  return base;
};

export const shouldAppendSetAfterUpdate = (sets: SetResult[], rules: ScoringRules): SetResult | null => {
  if (!isClassicRules(rules) || rules.fixedNumberOfSets === 1) return null;
  if (computeMatchWinner(sets, rules) !== null) return null;
  const cap = rules.fixedNumberOfSets > 0 ? rules.fixedNumberOfSets : 99;
  if (sets.length >= cap) return null;
  const scoredCount = sets.filter(isScored).length;
  if (scoredCount !== sets.length) return null;
  const { a, b } = countSetsWon(sets);
  if (a !== b) return null;
  const isSuperTb =
    rules.superTieBreakReplacesDeciderAtIndex !== null &&
    sets.length === rules.superTieBreakReplacesDeciderAtIndex;
  return { teamA: 0, teamB: 0, isTieBreak: isSuperTb };
};

export const trimTrailingEmptyAfterDecision = (sets: SetResult[], rules: ScoringRules): SetResult[] => {
  if (computeMatchWinner(sets, rules) === null) return sets;
  const trimmed: SetResult[] = [];
  for (const s of sets) {
    if (isScored(s)) trimmed.push(s);
  }
  return trimmed.length > 0 ? trimmed : sets;
};
