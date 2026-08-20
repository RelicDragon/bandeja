import { describe, expect, it } from 'vitest';
import {
  isRatingLeaderboardGrayed,
  ratingLeaderboardDeltaClass,
  ratingLeaderboardRankLabel,
} from './ratingLeaderboardDisplay';

describe('ratingLeaderboardDisplay', () => {
  it('grays only non-qualifying rating rows', () => {
    expect(isRatingLeaderboardGrayed('level', false)).toBe(true);
    expect(isRatingLeaderboardGrayed('level', true)).toBe(false);
    expect(isRatingLeaderboardGrayed('level', undefined)).toBe(false);
    expect(isRatingLeaderboardGrayed('social', false)).toBe(false);
  });

  it('shows a dash instead of stealing qualifier ranks', () => {
    expect(ratingLeaderboardRankLabel('level', 3, false, '—')).toBe('—');
    expect(ratingLeaderboardRankLabel('level', 1, true, '—')).toBe('1');
    expect(ratingLeaderboardRankLabel('social', 4, false, '—')).toBe('4');
  });

  it('mutes rating deltas on grayed rows instead of using win/loss color', () => {
    expect(ratingLeaderboardDeltaClass(0.12, true)).toContain('text-gray-400');
    expect(ratingLeaderboardDeltaClass(0.12, true)).not.toContain('text-green-600');
    expect(ratingLeaderboardDeltaClass(0.12, false)).toContain('text-green-600');
    expect(ratingLeaderboardDeltaClass(-0.08, false)).toContain('text-red-600');
  });
});
