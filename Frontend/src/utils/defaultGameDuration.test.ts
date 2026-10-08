import { describe, expect, it } from 'vitest';
import { defaultGameDurationHours } from './defaultGameDuration';

describe('defaultGameDurationHours', () => {
  it('gives league fixtures one hour, everything else two', () => {
    expect(defaultGameDurationHours('LEAGUE')).toBe(1);
    expect(defaultGameDurationHours('LEAGUE_SEASON')).toBe(1);
    expect(defaultGameDurationHours('GAME')).toBe(2);
    expect(defaultGameDurationHours('TOURNAMENT')).toBe(2);
    expect(defaultGameDurationHours(undefined)).toBe(2);
  });
});
