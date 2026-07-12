import type { SetResult } from '@/types/gameResults';
import type { ScoringRules, SetKind } from './rulebook';
import { isClassicAutomaticRelaxedScores } from './rulebook';
import {
  validateClassicRegularSet,
  validateSuperTiebreak,
  type ValidationResult,
} from './validateSet';

/** Max per-team score when automatic relaxed entry mode is Set / games. */
export const AUTOMATIC_GAMES_ENTRY_MAX = 10;

export {
  AUTOMATIC_RECORD_MODE_METADATA_KEY,
  type AutomaticMatchRecordMode,
  type AutomaticSetEntryMode,
  type AutomaticSetScoringKind,
  type RatingSetScore,
  isAutomaticRelaxedRules,
  parseAutomaticMatchRecordMode,
  mergeAutomaticMatchRecordMetadata,
  countAutomaticSetsWon,
  resolveAutomaticSetScoringKind,
  toRatingSetScores,
  ratingSetUsesGamesMargin,
  ratingSetUsesTiebreakMargin,
} from '@shared/automaticRelaxedScoring';

import {
  canUseSuperTiebreakEntry as canUseSuperTiebreakEntryShared,
  parseAutomaticMatchRecordMode,
} from '@shared/automaticRelaxedScoring';

export function resolveAutomaticSetEntryMode(
  setIndex: number,
  sets: SetResult[],
  rules: ScoringRules,
  matchMetadata: Record<string, unknown> | undefined,
  useSuperTiebreak: boolean,
): import('@shared/automaticRelaxedScoring').AutomaticSetEntryMode {
  if (useSuperTiebreak && canUseSuperTiebreakEntryShared(setIndex, sets, rules)) {
    return 'SUPER_TIEBREAK';
  }
  return parseAutomaticMatchRecordMode(matchMetadata);
}

export function automaticSetEntryUsesTieBreak(
  setIndex: number,
  sets: SetResult[],
  rules: ScoringRules,
  useSuperTiebreak: boolean,
): boolean {
  return useSuperTiebreak && canUseSuperTiebreakEntryShared(setIndex, sets, rules);
}

export function recommendAutomaticSetScore(
  a: number,
  b: number,
  rules: ScoringRules,
  mode: import('@shared/automaticRelaxedScoring').AutomaticSetEntryMode,
): ValidationResult {
  if (a < 0 || b < 0) return { ok: false, reason: 'NEGATIVE_SCORE' };
  if (a === 0 && b === 0) return { ok: true };

  if (mode === 'SUPER_TIEBREAK') {
    return validateSuperTiebreak(a, b, rules);
  }
  if (mode === 'GAMES') {
    return validateClassicRegularSet(a, b, rules);
  }
  if (a === b) return { ok: false, reason: 'DRAW_NOT_ALLOWED' };
  return { ok: true };
}

export function canUseSuperTiebreakEntry(
  setIndex: number,
  sets: SetResult[],
  rules: ScoringRules,
): boolean {
  if (!isClassicAutomaticRelaxedScores(rules)) return false;
  return canUseSuperTiebreakEntryShared(setIndex, sets, rules);
}

/** Keypad bounds for automatic-relaxed score entry — driven by entryMode, not set geometry alone. */
export function getAutomaticRelaxedKeypadOptions(
  rules: ScoringRules,
  entryMode: import('@shared/automaticRelaxedScoring').AutomaticSetEntryMode,
): { max: number; kind: SetKind } {
  if (entryMode === 'SUPER_TIEBREAK') {
    const target = rules.superTieBreakFirstTo;
    const max = Math.max(target + 5, target);
    return { max, kind: 'SUPER_TIEBREAK' };
  }
  if (entryMode === 'GAMES') {
    return { max: AUTOMATIC_GAMES_ENTRY_MAX, kind: 'REGULAR' };
  }
  const max =
    rules.maxPointsPerTeam > 0
      ? rules.maxPointsPerTeam * 2
      : rules.totalPointsPerSet > 0
        ? rules.totalPointsPerSet
        : 999;
  return { max, kind: 'REGULAR' };
}
