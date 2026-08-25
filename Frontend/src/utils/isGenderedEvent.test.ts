import { describe, expect, it } from 'vitest';
import { isGenderedEvent } from './isGenderedEvent';

describe('isGenderedEvent', () => {
  it('is false for missing or ANY games', () => {
    expect(isGenderedEvent(null)).toBe(false);
    expect(isGenderedEvent(undefined)).toBe(false);
    expect(isGenderedEvent({})).toBe(false);
    expect(isGenderedEvent({ genderTeams: 'ANY' })).toBe(false);
  });

  it('is false for bars even when genderTeams is set', () => {
    expect(isGenderedEvent({ genderTeams: 'MEN', entityType: 'BAR' })).toBe(false);
  });

  it('is true for men, women, and mix-pairs events', () => {
    expect(isGenderedEvent({ genderTeams: 'MEN' })).toBe(true);
    expect(isGenderedEvent({ genderTeams: 'WOMEN' })).toBe(true);
    expect(isGenderedEvent({ genderTeams: 'MIX_PAIRS', entityType: 'GAME' })).toBe(true);
  });
});
