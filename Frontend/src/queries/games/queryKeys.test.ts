import { describe, expect, it } from 'vitest';
import { buildAvailableGamesFilterHash, queryKeys } from '../queryKeys';

describe('games query keys', () => {
  it('my games key shape', () => {
    expect(queryKeys.games.my('user-1')).toEqual(['games', 'my', 'user-1']);
  });

  it('available games key shape', () => {
    expect(queryKeys.games.available('city-1-false-primary-0')).toEqual([
      'games',
      'available',
      'city-1-false-primary-0',
    ]);
  });

  it('past games key shape', () => {
    expect(queryKeys.games.past('user-1')).toEqual(['games', 'past', 'user-1']);
  });

  it('filterHash changes when dates change', () => {
    const base = {
      cityId: 'city-1',
      includeLeagues: false,
      sport: 'PADEL',
      isAdmin: false,
      showPrivateGames: false,
    };
    const hashA = buildAvailableGamesFilterHash({
      ...base,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-31'),
    });
    const hashB = buildAvailableGamesFilterHash({
      ...base,
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-02-28'),
    });
    expect(hashA).not.toBe(hashB);
  });

  it('filterHash changes when sport changes', () => {
    const hashPadel = buildAvailableGamesFilterHash({ sport: 'PADEL' });
    const hashTennis = buildAvailableGamesFilterHash({ sport: 'TENNIS' });
    expect(hashPadel).not.toBe(hashTennis);
  });

  it('filterHash includes private flag for admin', () => {
    const withoutPrivate = buildAvailableGamesFilterHash({ isAdmin: true, showPrivateGames: false });
    const withPrivate = buildAvailableGamesFilterHash({ isAdmin: true, showPrivateGames: true });
    expect(withoutPrivate).not.toBe(withPrivate);
  });

  it('filterHash includes structural SQL params', () => {
    const base = buildAvailableGamesFilterHash({ sport: 'PADEL', cityId: 'c1' });
    const withClubs = buildAvailableGamesFilterHash({
      sport: 'PADEL',
      cityId: 'c1',
      structural: { mode: 'calendar', clubIds: 'club-1', hideBar: true },
    });
    expect(base).not.toBe(withClubs);
  });
});
