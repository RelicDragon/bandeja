import type { SetResult } from '@/types/gameResults';
import { isOfficialMatchSet, isSupplementalMatchSet, splitOfficialAndSupplementalSets } from '@/utils/matchSetRole';
import type { ScoringRules } from './rulebook';
import { isClassicRules, isPointsRules, isTimedRules } from './rulebook';
import { countSetsWon, getStandingsMatchOutcome } from './matchWinner';

const emptySet = (isTieBreak = false): SetResult => ({ teamA: 0, teamB: 0, isTieBreak, role: 'OFFICIAL' });

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

/** Indices into `displaySets` that should receive a grid column (omit empty 0:0 when results are FINAL). */
export const layoutSetIndicesForMatchGrid = (
  displaySets: SetResult[],
  canEnterResults: boolean,
  resultsStatus?: 'NONE' | 'IN_PROGRESS' | 'FINAL' | null
): number[] => {
  if (!canEnterResults) return [];
  const hideEmptyZeros = resultsStatus === 'FINAL';
  const idx: number[] = [];
  for (let i = 0; i < displaySets.length; i += 1) {
    const set = displaySets[i];
    const played = set.teamA > 0 || set.teamB > 0;
    if (played) {
      idx.push(i);
      continue;
    }
    if (isSupplementalMatchSet(set)) {
      if (!hideEmptyZeros) idx.push(i);
      continue;
    }
    if (hideEmptyZeros) continue;
    const priorEmptyOfficial = displaySets.slice(0, i).some(
      s => isOfficialMatchSet(s) && s.teamA === 0 && s.teamB === 0
    );
    if (priorEmptyOfficial) continue;
    idx.push(i);
  }
  return idx;
};

export const expandSetsForDisplay = (
  sets: SetResult[],
  rules: ScoringRules,
  options: { canEditResults: boolean }
): SetResult[] => {
  const { official, supplemental } = splitOfficialAndSupplementalSets(sets);

  if (isPointsRules(rules) || isTimedRules(rules)) {
    const existing = official[0] ?? sets[0] ?? emptySet();
    return [existing, ...supplemental];
  }

  if (isClassicRules(rules)) {
    const decided = getStandingsMatchOutcome(official, rules) !== null;
    const base = [...official];
    const scoredCount = base.filter(isScored).length;

    const minVisible = rules.fixedNumberOfSets === 1 ? 1 : Math.max(rules.minSetsToWin, 1);
    if (!decided && rules.fixedNumberOfSets !== 1) {
      while (base.length > minVisible) {
        const last = base[base.length - 1];
        if (isScored(last)) break;
        const { a, b } = countSetsWon(base.slice(0, -1));
        if (a === b && a > 0) break;
        if (Math.max(a, b) < rules.minSetsToWin) break;
        base.pop();
      }
    }
    while (base.length < minVisible) base.push(emptySet());

    if (decided) {
      const trimmed: SetResult[] = [];
      for (const s of base) {
        if (isScored(s)) trimmed.push(s);
      }
      if (trimmed.length === 0) return [...base.slice(0, minVisible), ...supplemental];
      return [...trimmed, ...supplemental];
    }

    const cap = rules.fixedNumberOfSets > 0 ? rules.fixedNumberOfSets : Math.max(minVisible, base.length);
    if (options.canEditResults && scoredCount === base.length && base.length < cap) {
      const { a, b } = countSetsWon(base);
      if (Math.max(a, b) < rules.minSetsToWin) {
        const isSuperTb =
          rules.superTieBreakReplacesDeciderAtIndex !== null &&
          base.length === rules.superTieBreakReplacesDeciderAtIndex;
        base.push(emptySet(isSuperTb));
      }
    }

    return [...base, ...supplemental];
  }

  if (rules.fixedNumberOfSets > 0) {
    const base = [...official];
    while (base.length < rules.fixedNumberOfSets) base.push(emptySet());
    return [...base.slice(0, rules.fixedNumberOfSets), ...supplemental];
  }

  const base = [...official];
  if (options.canEditResults) {
    if (base.length === 0) base.push(emptySet());
    else {
      const last = base[base.length - 1];
      if (isScored(last) && !last.isTieBreak) base.push(emptySet());
    }
  } else if (base.length > 0) {
    const last = base[base.length - 1];
    if (isScored(last) && !last.isTieBreak) base.push(emptySet());
  }
  return [...base, ...supplemental];
};

export const shouldAppendSetAfterUpdate = (sets: SetResult[], rules: ScoringRules): SetResult | null => {
  if (!isClassicRules(rules) || rules.fixedNumberOfSets === 1) return null;
  const { official } = splitOfficialAndSupplementalSets(sets);
  if (getStandingsMatchOutcome(official, rules) !== null) return null;
  const cap = rules.fixedNumberOfSets > 0 ? rules.fixedNumberOfSets : 99;
  if (official.length >= cap) return null;
  const scoredCount = official.filter(isScored).length;
  if (scoredCount !== official.length) return null;
  const { a, b } = countSetsWon(official);
  if (Math.max(a, b) >= rules.minSetsToWin) return null;
  const isSuperTb =
    rules.superTieBreakReplacesDeciderAtIndex !== null &&
    official.length === rules.superTieBreakReplacesDeciderAtIndex;
  return { teamA: 0, teamB: 0, isTieBreak: isSuperTb, role: 'OFFICIAL' };
};

export const trimTrailingEmptyAfterDecision = (sets: SetResult[], rules: ScoringRules): SetResult[] => {
  const { official, supplemental } = splitOfficialAndSupplementalSets(sets);
  if (getStandingsMatchOutcome(official, rules) === null) return sets;
  const trimmed: SetResult[] = [];
  for (const s of official) {
    if (isScored(s)) trimmed.push(s);
  }
  const officialOut = trimmed.length > 0 ? trimmed : official;
  return [...officialOut, ...supplemental];
};
