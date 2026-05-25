import type { BracketPlayInMatchup } from './bracketStructure';
import { getBracketStructureMetrics } from './bracketStructure';

export type PlayInSeedPair = [number, number];

export type CustomPlayInValidationError =
  | 'COUNT_MISMATCH'
  | 'SEED_OUT_OF_RANGE'
  | 'DUPLICATE_SEED'
  | 'BYE_SEED_IN_PAIR'
  | 'INVALID_PAIR';

export function validateCustomPlayInSeedPairs(
  entrantCount: number,
  pairs: PlayInSeedPair[],
  customByeSeedRanks?: number[]
): { valid: true } | { valid: false; error: CustomPlayInValidationError } {
  const metrics = getBracketStructureMetrics(entrantCount, customByeSeedRanks);
  const expected = metrics.playInGameCount;
  if (pairs.length !== expected) {
    return { valid: false, error: 'COUNT_MISMATCH' };
  }
  const byeSet = new Set(metrics.byeSeeds);
  const used = new Set<number>();
  for (const [a, b] of pairs) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1 || a > entrantCount || b > entrantCount) {
      return { valid: false, error: 'SEED_OUT_OF_RANGE' };
    }
    if (a === b) return { valid: false, error: 'INVALID_PAIR' };
    if (byeSet.has(a) || byeSet.has(b)) return { valid: false, error: 'BYE_SEED_IN_PAIR' };
    if (used.has(a) || used.has(b)) return { valid: false, error: 'DUPLICATE_SEED' };
    used.add(a);
    used.add(b);
  }
  const playInSeeds = new Set<number>();
  for (let s = metrics.byeCount + 1; s <= entrantCount; s++) playInSeeds.add(s);
  for (const seed of used) {
    if (!playInSeeds.has(seed)) return { valid: false, error: 'SEED_OUT_OF_RANGE' };
  }
  return { valid: true };
}

export function playInMatchupsFromSeedPairs(pairs: PlayInSeedPair[]): BracketPlayInMatchup[] {
  return pairs
    .map(([seedA, seedB], matchIndex) => ({ matchIndex, seedA, seedB }))
    .sort((a, b) => a.seedA - b.seedA || a.seedB - b.seedB);
}
