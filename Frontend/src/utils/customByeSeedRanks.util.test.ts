import { describe, expect, it } from 'vitest';
import {
  byeCountForEntrants,
  supportsThirdPlaceMatch,
  toggleCustomByeSeedRank,
  validateCustomByeSeedRanks,
} from './customByeSeedRanks.util';

describe('customByeSeedRanks.util', () => {
  it('byeCountForEntrants', () => {
    expect(byeCountForEntrants(7)).toBe(1);
    expect(byeCountForEntrants(8)).toBe(0);
  });

  it('supportsThirdPlaceMatch', () => {
    expect(supportsThirdPlaceMatch(3)).toBe(false);
    expect(supportsThirdPlaceMatch(4)).toBe(true);
  });

  it('validateCustomByeSeedRanks', () => {
    expect(validateCustomByeSeedRanks(undefined, 7, 1)).toEqual({ valid: true });
    expect(validateCustomByeSeedRanks([2], 7, 1)).toEqual({ valid: true });
    expect(validateCustomByeSeedRanks([1, 2], 7, 1)).toEqual({ valid: false, error: 'countMismatch' });
    expect(validateCustomByeSeedRanks([1, 1], 7, 2)).toEqual({ valid: false, error: 'duplicate' });
    expect(validateCustomByeSeedRanks([8], 7, 1)).toEqual({ valid: false, error: 'outOfRange' });
  });

  it('toggleCustomByeSeedRank', () => {
    expect(toggleCustomByeSeedRank([], 3, 2)).toEqual([3]);
    expect(toggleCustomByeSeedRank([3], 3, 2)).toEqual([]);
    expect(toggleCustomByeSeedRank([1], 2, 1)).toEqual([1]);
  });
});
