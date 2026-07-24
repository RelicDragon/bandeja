import { describe, expect, it } from 'vitest';
import {
  resolveStandingMedalMode,
  resolveStandingPlaceVisual,
} from '@/utils/gameCardStandingPlace';

describe('resolveStandingMedalMode', () => {
  it('uses podium medals for tournaments', () => {
    expect(resolveStandingMedalMode('TOURNAMENT')).toBe('podium');
  });

  it('uses winner-only gold for normal games', () => {
    expect(resolveStandingMedalMode('GAME')).toBe('winner');
    expect(resolveStandingMedalMode('TRAINING')).toBe('winner');
  });
});

describe('resolveStandingPlaceVisual', () => {
  it('gives gold to every 1st-place tie', () => {
    expect(resolveStandingPlaceVisual(1, 'winner')).toBe('gold');
    expect(resolveStandingPlaceVisual(1, 'podium')).toBe('gold');
  });

  it('winner mode shows numbers for 2nd+', () => {
    expect(resolveStandingPlaceVisual(2, 'winner')).toBe('number');
    expect(resolveStandingPlaceVisual(3, 'winner')).toBe('number');
  });

  it('podium mode medals first three places including ties', () => {
    expect(resolveStandingPlaceVisual(2, 'podium')).toBe('silver');
    expect(resolveStandingPlaceVisual(3, 'podium')).toBe('bronze');
    expect(resolveStandingPlaceVisual(4, 'podium')).toBe('number');
  });

  it('rejects invalid place values', () => {
    expect(resolveStandingPlaceVisual(0, 'winner')).toBe('number');
    expect(resolveStandingPlaceVisual(Number.NaN, 'podium')).toBe('number');
  });
});
