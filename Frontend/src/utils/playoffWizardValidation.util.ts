import {
  validateCustomByeSeedRanks,
  byeCountForEntrants,
  type CustomByeValidationError,
} from '@/utils/customByeSeedRanks.util';
import {
  validateCustomPlayInSeedPairs,
  type CustomPlayInValidationError,
  type PlayInSeedPair,
} from '@/utils/bracketCustomPlayIn.util';

export function customByeErrorI18nKey(error: CustomByeValidationError): string {
  switch (error) {
    case 'countMismatch':
      return 'gameDetails.bracketCustomByesErrorCount';
    case 'duplicate':
      return 'gameDetails.bracketCustomByesErrorDuplicate';
    case 'outOfRange':
      return 'gameDetails.bracketCustomByesErrorRange';
    default:
      return 'errors.generic';
  }
}

export function customPlayInErrorI18nKey(error: CustomPlayInValidationError): string {
  switch (error) {
    case 'COUNT_MISMATCH':
      return 'gameDetails.bracketCustomPlayInErrorCount';
    case 'DUPLICATE_SEED':
      return 'gameDetails.bracketCustomPlayInErrorDuplicate';
    case 'BYE_SEED_IN_PAIR':
      return 'gameDetails.bracketCustomPlayInErrorByeSeed';
    case 'INVALID_PAIR':
      return 'gameDetails.bracketCustomPlayInErrorInvalidPair';
    case 'SEED_OUT_OF_RANGE':
    default:
      return 'gameDetails.bracketCustomPlayInError';
  }
}

export function getCustomByeValidation(
  entrantCount: number,
  enabled: boolean,
  ranks: number[]
): { valid: true } | { valid: false; error: CustomByeValidationError } {
  if (!enabled) return { valid: true };
  const byeCount = byeCountForEntrants(entrantCount);
  if (byeCount <= 0) return { valid: true };
  if (ranks.length === 0) return { valid: false, error: 'countMismatch' };
  return validateCustomByeSeedRanks(ranks, entrantCount, byeCount);
}

export function getCustomPlayInValidation(
  entrantCount: number,
  enabled: boolean,
  pairs: PlayInSeedPair[],
  customByeSeedRanks?: number[]
): { valid: true } | { valid: false; error: CustomPlayInValidationError } {
  if (!enabled) return { valid: true };
  if (pairs.length === 0) return { valid: false, error: 'COUNT_MISMATCH' };
  return validateCustomPlayInSeedPairs(entrantCount, pairs, customByeSeedRanks);
}

export function formatByeRangeForSummary(byeSeeds: number[]): string | null {
  if (byeSeeds.length === 0) return null;
  if (byeSeeds.length === 1) return `#${byeSeeds[0]}`;
  const sorted = [...byeSeeds].sort((a, b) => a - b);
  const isContiguous = sorted.every((s, i) => i === 0 || s === sorted[i - 1] + 1);
  if (isContiguous && sorted.length > 2) return `#${sorted[0]}–#${sorted[sorted.length - 1]}`;
  return sorted.map((s) => `#${s}`).join(', ');
}
