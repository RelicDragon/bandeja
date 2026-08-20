import { describe, expect, it } from 'vitest';
import {
  isRatingLeaderboardGrayed,
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
});
