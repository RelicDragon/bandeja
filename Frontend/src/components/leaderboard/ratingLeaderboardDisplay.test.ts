import { describe, expect, it } from 'vitest';
import {
  RATING_LEADERBOARD_MUTED_TEXT,
  firstInactiveRatingRowId,
  isRatingLeaderboardGrayed,
  ratingLeaderboardDeltaClass,
  ratingLeaderboardRankLabel,
} from './ratingLeaderboardDisplay';

describe('ratingLeaderboardDisplay', () => {
  it('grays only inactive rating rows', () => {
    expect(isRatingLeaderboardGrayed('level', true)).toBe(true);
    expect(isRatingLeaderboardGrayed('level', false)).toBe(false);
    expect(isRatingLeaderboardGrayed('level', undefined)).toBe(false);
    expect(isRatingLeaderboardGrayed('social', true)).toBe(false);
  });

  it('shows a dash instead of stealing qualifier ranks', () => {
    expect(ratingLeaderboardRankLabel('level', 3, true, '—')).toBe('—');
    expect(ratingLeaderboardRankLabel('level', 1, false, '—')).toBe('1');
    expect(ratingLeaderboardRankLabel('social', 4, true, '—')).toBe('4');
    expect(ratingLeaderboardRankLabel('level', 8, true, 'Not ranked')).toBe('Not ranked');
  });

  it('marks the first inactive rating row for a section caption', () => {
    expect(
      firstInactiveRatingRowId('level', [
        { id: 'a', inactive: false },
        { id: 'b', inactive: true },
        { id: 'c', inactive: true },
      ]),
    ).toBe('b');
    expect(firstInactiveRatingRowId('social', [{ id: 'b', inactive: true }])).toBeUndefined();
    expect(firstInactiveRatingRowId('level', [{ id: 'a', inactive: false }])).toBeUndefined();
  });

  it('mutes rating deltas on grayed rows instead of using win/loss color', () => {
    expect(ratingLeaderboardDeltaClass(0.12, true)).toContain(RATING_LEADERBOARD_MUTED_TEXT);
    expect(ratingLeaderboardDeltaClass(0.12, true)).not.toContain('text-green-600');
    expect(ratingLeaderboardDeltaClass(0.12, false)).toContain('text-green-600');
    expect(ratingLeaderboardDeltaClass(-0.08, false)).toContain('text-red-600');
  });
});
