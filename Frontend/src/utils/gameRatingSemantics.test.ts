import { describe, expect, it } from 'vitest';
import { gameIsNonRating, gameShowsLevelBand } from './gameRatingSemantics';

describe('BAR rating semantics', () => {
  it('ignores stale BAR rating metadata', () => {
    const bar = {
      entityType: 'BAR' as const,
      minLevel: 2.5,
      maxLevel: 4.5,
      affectsRating: true,
    };

    expect(gameShowsLevelBand(bar)).toBe(false);
    expect(gameIsNonRating(bar)).toBe(true);
  });

  it('preserves regular game rating metadata', () => {
    const game = {
      entityType: 'GAME' as const,
      minLevel: 2.5,
      maxLevel: 4.5,
      affectsRating: true,
    };

    expect(gameShowsLevelBand(game)).toBe(true);
    expect(gameIsNonRating(game)).toBe(false);
  });
});
