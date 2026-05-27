import { describe, expect, it } from 'vitest';
import { appendLevelSportQuery, parseLevelSportQuery } from './levelSportQuery';
import { Sports } from '@shared/sport';

describe('levelSportQuery', () => {
  it('parseLevelSportQuery accepts valid sport', () => {
    expect(parseLevelSportQuery(Sports.TENNIS)).toBe(Sports.TENNIS);
  });

  it('parseLevelSportQuery rejects invalid values', () => {
    expect(parseLevelSportQuery('FOOTBALL')).toBeUndefined();
    expect(parseLevelSportQuery(null)).toBeUndefined();
    expect(parseLevelSportQuery(undefined)).toBeUndefined();
  });

  it('appendLevelSportQuery adds sport query param', () => {
    expect(appendLevelSportQuery('/profile/u1', Sports.PADEL)).toBe('/profile/u1?sport=PADEL');
  });

  it('appendLevelSportQuery appends when path already has query', () => {
    expect(appendLevelSportQuery('/profile/u1?tab=stats', Sports.TENNIS)).toBe(
      '/profile/u1?tab=stats&sport=TENNIS',
    );
  });

  it('appendLevelSportQuery returns path unchanged when sport omitted', () => {
    expect(appendLevelSportQuery('/profile/u1', undefined)).toBe('/profile/u1');
  });
});
