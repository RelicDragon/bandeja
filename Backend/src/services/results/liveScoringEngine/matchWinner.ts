import type { ScoringRules } from './rulebook';
import type { SetResult } from './types';
import {
  computeMatchWinnerLiveScoring,
  isMatchDecidedForLiveScoring,
  getStandingsMatchOutcome,
  isLiveMatchCompleteForScoring,
} from './matchWinnerLive';

export type MatchWinnerSide = 'A' | 'B' | null;

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

/** @deprecated Prefer `computeMatchWinnerLiveScoring`; kept for imports expecting this name. */
export const computeMatchWinner = computeMatchWinnerLiveScoring;

export const isMatchDecided = (sets: SetResult[], rules: ScoringRules): boolean =>
  getStandingsMatchOutcome(sets, rules) !== null;

export {
  computeMatchWinnerLiveScoring,
  isMatchDecidedForLiveScoring,
  getStandingsMatchOutcome,
  isLiveMatchCompleteForScoring,
} from './matchWinnerLive';
