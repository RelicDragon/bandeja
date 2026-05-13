import type { ScoringRules } from './rulebook';
import type { SetResult } from './types';

export type MatchWinnerSide = 'A' | 'B' | null;

const isSetPlayed = (set: SetResult): boolean => set.teamA > 0 || set.teamB > 0;

export function isOfficialLiveMatchSet(set: SetResult): boolean {
  return !set.role || set.role === 'OFFICIAL';
}

function isSupplementalLiveSet(set: SetResult): boolean {
  return set.role === 'EXTRA_GAMES' || set.role === 'EXTRA_BALLS';
}

export function splitOfficialSupplementalLiveSets(sets: SetResult[]): {
  official: SetResult[];
  supplemental: SetResult[];
} {
  const i = sets.findIndex(isSupplementalLiveSet);
  if (i === -1) return { official: sets, supplemental: [] };
  return { official: sets.slice(0, i), supplemental: sets.slice(i) };
}

const setWinner = (set: SetResult): MatchWinnerSide => {
  if (!isSetPlayed(set)) return null;
  if (set.teamA > set.teamB) return 'A';
  if (set.teamB > set.teamA) return 'B';
  return null;
};

export const computeMatchWinner = (sets: SetResult[], rules: ScoringRules): MatchWinnerSide => {
  const playedSets = sets.filter(isSetPlayed).filter(isOfficialLiveMatchSet);
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
    if (rules.fixedNumberOfSets > 0 && playedSets.length >= rules.fixedNumberOfSets) {
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

export const isMatchDecided = (sets: SetResult[], rules: ScoringRules): boolean =>
  computeMatchWinner(sets, rules) !== null;

export { computeMatchWinnerLiveScoring, isMatchDecidedForLiveScoring } from './matchWinnerLive';
