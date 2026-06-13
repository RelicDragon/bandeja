import { describe, expect, it } from 'vitest';
import { supportsClubBookingFlow } from './supportsClubBookingFlow';

describe('supportsClubBookingFlow', () => {
  it('allows GAME, TRAINING, TOURNAMENT on create', () => {
    expect(supportsClubBookingFlow('GAME')).toBe(true);
    expect(supportsClubBookingFlow('TRAINING')).toBe(true);
    expect(supportsClubBookingFlow('TOURNAMENT')).toBe(true);
  });

  it('excludes LEAGUE on create', () => {
    expect(supportsClubBookingFlow('LEAGUE')).toBe(false);
  });

  it('includes LEAGUE on edit', () => {
    expect(supportsClubBookingFlow('LEAGUE', 'edit')).toBe(true);
  });

  it('excludes BAR and LEAGUE_SEASON', () => {
    expect(supportsClubBookingFlow('BAR')).toBe(false);
    expect(supportsClubBookingFlow('LEAGUE_SEASON')).toBe(false);
    expect(supportsClubBookingFlow('BAR', 'edit')).toBe(false);
    expect(supportsClubBookingFlow('LEAGUE_SEASON', 'edit')).toBe(false);
  });
});
