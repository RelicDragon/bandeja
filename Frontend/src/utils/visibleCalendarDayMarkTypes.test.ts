import { describe, expect, it } from 'vitest';
import { visibleCalendarDayMarkTypes } from './visibleCalendarDayMarkTypes';

describe('visibleCalendarDayMarkTypes', () => {
  const mixed = ['GAME', 'TRAINING', 'LEAGUE', 'BAR'] as const;

  it('hides league marks unless league marks are enabled', () => {
    expect(visibleCalendarDayMarkTypes(mixed, false)).toEqual(['GAME', 'TRAINING', 'BAR']);
  });

  it('keeps league marks when enabled', () => {
    expect(visibleCalendarDayMarkTypes(mixed, true)).toEqual(['GAME', 'TRAINING', 'LEAGUE', 'BAR']);
  });

  it('leaves a league-only day with no marks when league marks are hidden', () => {
    expect(visibleCalendarDayMarkTypes(['LEAGUE'], false)).toEqual([]);
  });
});
