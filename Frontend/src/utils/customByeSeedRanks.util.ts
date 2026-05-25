import { nextPowerOf2 } from '@/utils/bracketStructure';

export type CustomByeValidationError = 'countMismatch' | 'duplicate' | 'outOfRange' | 'unexpected';

export function byeCountForEntrants(entrantCount: number): number {
  return nextPowerOf2(entrantCount) - entrantCount;
}

export function supportsThirdPlaceMatch(entrantCount: number): boolean {
  return entrantCount >= 4;
}

export function validateCustomByeSeedRanks(
  ranks: number[] | undefined,
  entrantCount: number,
  byeCount: number
): { valid: true } | { valid: false; error: CustomByeValidationError } {
  if (byeCount <= 0) {
    return ranks?.length ? { valid: false, error: 'unexpected' } : { valid: true };
  }
  if (!ranks?.length) return { valid: true };
  if (ranks.length !== byeCount) return { valid: false, error: 'countMismatch' };
  const seen = new Set<number>();
  for (const rank of ranks) {
    if (!Number.isInteger(rank) || rank < 1 || rank > entrantCount) {
      return { valid: false, error: 'outOfRange' };
    }
    if (seen.has(rank)) return { valid: false, error: 'duplicate' };
    seen.add(rank);
  }
  return { valid: true };
}

export function toggleCustomByeSeedRank(ranks: number[], seed: number, byeCount: number): number[] {
  const set = new Set(ranks);
  if (set.has(seed)) set.delete(seed);
  else if (set.size < byeCount) set.add(seed);
  return [...set].sort((a, b) => a - b);
}
