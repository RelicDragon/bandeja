import type { SetResult } from '@/types/gameResults';
import type { ScoringRules } from './rulebook';
import { isClassicAutomaticRelaxedScores } from './rulebook';
import {
  validateClassicRegularSet,
  validateSuperTiebreak,
  type ValidationResult,
} from './validateSet';

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
