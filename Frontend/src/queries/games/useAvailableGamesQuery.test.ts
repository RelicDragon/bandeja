import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Game } from '@/types';

const { getAvailableGames } = vi.hoisted(() => ({
  getAvailableGames: vi.fn(),
}));

vi.mock('@/api', () => ({
  gamesApi: {
    getAvailableGames: (...args: unknown[]) => getAvailableGames(...args),
  },
}));

import { availableGamesQueryOptions } from './useAvailableGamesQuery';
import { buildAvailableGamesFilterHash } from '../queryKeys';

function sampleGame(id: string, startTime: string): Game {
  return { id, startTime } as Game;
}

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

describe('useAvailableGamesQuery', () => {
  beforeEach(() => {
    getAvailableGames.mockReset();
    getAvailableGames.mockResolvedValue({
      data: [sampleGame('g1', '2026-06-01')],
    });
  });

  it('fetches once per filterHash within stale window', async () => {
    const client = createTestClient();
    const params = { userId: 'user-1', sport: 'PADEL', cityId: 'city-1' };
    const options = availableGamesQueryOptions(params);

    await client.fetchQuery(options);
    await client.fetchQuery(options);

    expect(getAvailableGames).toHaveBeenCalledTimes(1);
  });

  it('refetches when filterHash changes', async () => {
    const client = createTestClient();
    const padel = availableGamesQueryOptions({ userId: 'user-1', sport: 'PADEL' });
    const tennis = availableGamesQueryOptions({ userId: 'user-1', sport: 'TENNIS' });

    await client.fetchQuery(padel);
    await client.fetchQuery(tennis);

    expect(getAvailableGames).toHaveBeenCalledTimes(2);
    expect(padel.queryKey[2]).toBe(buildAvailableGamesFilterHash({ sport: 'PADEL' }));
    expect(tennis.queryKey[2]).toBe(buildAvailableGamesFilterHash({ sport: 'TENNIS' }));
    expect(padel.queryKey[2]).not.toBe(tennis.queryKey[2]);
  });

  it('passes api params matching legacy hook', async () => {
    const client = createTestClient();
    const startDate = new Date('2026-06-01');
    const endDate = new Date('2026-06-30');
    await client.fetchQuery(
      availableGamesQueryOptions({
        userId: 'user-1',
        startDate,
        endDate,
        includeLeagues: true,
        sport: 'PADEL',
        isAdmin: true,
        showPrivateGames: true,
      }),
    );

    expect(getAvailableGames).toHaveBeenCalledWith({
      showArchived: true,
      includeLeagues: true,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      sport: 'PADEL',
      showPrivateGames: true,
    });
  });
});
