import { describe, expect, it } from 'vitest';
import { passesFindSuitableRatingFilter } from './findAvailabilityFilters';
import type { Game, User } from '@/types';

describe('Find client-only heuristics', () => {
  it('suitable rating stays viewer-level client filter', () => {
    const game = {
      id: 'g1',
      sport: 'PADEL',
      minLevel: 3,
      maxLevel: 4,
      participants: [],
      maxParticipants: 4,
    } as unknown as Game;
    const inBand = {
      id: 'u1',
      primarySport: 'PADEL',
      sportProfiles: [{ sport: 'PADEL', level: 3.5 }],
    } as unknown as User;
    const outOfBand = {
      id: 'u2',
      primarySport: 'PADEL',
      sportProfiles: [{ sport: 'PADEL', level: 5 }],
    } as unknown as User;
    expect(passesFindSuitableRatingFilter(game, inBand)).toBe(true);
    expect(passesFindSuitableRatingFilter(game, outOfBand)).toBe(false);
  });
});
