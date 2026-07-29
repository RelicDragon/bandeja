import { describe, expect, it } from 'vitest';
import { resolveCreateGameRatingFields } from './createGameRatingFields';

describe('resolveCreateGameRatingFields', () => {
  it('removes rating metadata from BAR events', () => {
    expect(resolveCreateGameRatingFields('BAR', [2.5, 4.5], true)).toEqual({
      minLevel: null,
      maxLevel: null,
      affectsRating: false,
    });
  });

  it('keeps rating metadata for regular games', () => {
    expect(resolveCreateGameRatingFields('GAME', [2.5, 4.5], true)).toEqual({
      minLevel: 2.5,
      maxLevel: 4.5,
      affectsRating: true,
    });
  });
});
