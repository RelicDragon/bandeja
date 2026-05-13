import type { SetResult } from '@/types/gameResults';
import { isOfficialMatchSet } from '@/utils/matchSetRole';
import type { ScoringRules } from './rulebook';
import { isLegalSetScore } from './validateSet';

export type MatchWinnerSide = 'A' | 'B' | null;

const isSetPlayed = (set: SetResult): boolean => set.teamA > 0 || set.teamB > 0;

const setWinner = (set: SetResult): MatchWinnerSide => {
  if (!isSetPlayed(set)) return null;
  if (set.teamA > set.teamB) return 'A';
  if (set.teamB > set.teamA) return 'B';
  return null;
};

/** Official rows whose scores are valid *completed* sets (excludes 5–4 in-progress, partial points rows, etc.). */
const completedOfficialSetsForLive = (sets: SetResult[], rules: ScoringRules): SetResult[] => {
  const out: SetResult[] = [];
  for (let i = 0; i < sets.length; i += 1) {
    const set = sets[i];
    if (!isOfficialMatchSet(set) || !isSetPlayed(set)) continue;
    if (!isLegalSetScore(set.teamA, set.teamB, rules, i, sets, set.isTieBreak).ok) continue;
    out.push(set);
  }
  return out;
};

/**
 * Match winner using only rows that pass `isLegalSetScore` — for live UI/engine freeze so partial sets
 * do not count as decided.
 */
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
    const anyBallOfficial = sets.filter(isOfficialMatchSet).filter(isSetPlayed).length;
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
