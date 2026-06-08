import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Game } from '@/types';

const { getPastGames } = vi.hoisted(() => ({
  getPastGames: vi.fn(),
}));

vi.mock('@/api', () => ({
  gamesApi: {
    getPastGames: (...args: unknown[]) => getPastGames(...args),
  },
}));

import {
  flattenPastGamesPages,
  pastGamesInfiniteQueryOptions,
} from './usePastGamesQuery';
import { queryKeys } from '../queryKeys';

function sampleGame(id: string, startTime: string, extra?: Partial<Game>): Game {
  return { id, startTime, entityType: 'GAME', resultsStatus: 'FINAL', ...extra } as Game;
}

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

describe('usePastGamesQuery', () => {
  beforeEach(() => {
    getPastGames.mockReset();
  });

  it('uses expected query key shape', () => {
    const options = pastGamesInfiniteQueryOptions('user-1');
    expect(options.queryKey).toEqual(queryKeys.games.past('user-1'));
  });

  it('fetches once per key within stale window', async () => {
    getPastGames.mockResolvedValue({ data: [sampleGame('g1', '2026-05-01')] });
    const client = createTestClient();
    const options = pastGamesInfiniteQueryOptions('user-1');

    await client.fetchInfiniteQuery(options);
    await client.fetchInfiniteQuery(options);

    expect(getPastGames).toHaveBeenCalledTimes(1);
  });

  it('pagination appends pages', async () => {
    const page1 = Array.from({ length: 30 }, (_, i) =>
      sampleGame(`g-${i}`, `2026-05-${String(i + 1).padStart(2, '0')}`),
    );
    const page2 = [sampleGame('g-30', '2026-04-01'), sampleGame('g-31', '2026-03-01')];

    getPastGames
      .mockResolvedValueOnce({ data: page1 })
      .mockResolvedValueOnce({ data: page2 });

    const client = createTestClient();
    const options = pastGamesInfiniteQueryOptions('user-1');

    const result = await client.fetchInfiniteQuery({
      ...options,
      pages: 2,
    });

    expect(getPastGames).toHaveBeenCalledTimes(2);
    expect(getPastGames).toHaveBeenNthCalledWith(1, { limit: 30, offset: 0 });
    expect(getPastGames).toHaveBeenNthCalledWith(2, { limit: 30, offset: 30 });
    expect(result.pages).toHaveLength(2);
    expect(flattenPastGamesPages(result.pages)).toHaveLength(32);
  });

  it('filters non-final league seasons', async () => {
    getPastGames.mockResolvedValue({
      data: [
        sampleGame('league-open', '2026-05-01', {
          entityType: 'LEAGUE_SEASON',
          resultsStatus: 'IN_PROGRESS',
        }),
        sampleGame('league-final', '2026-04-01', {
          entityType: 'LEAGUE_SEASON',
          resultsStatus: 'FINAL',
        }),
        sampleGame('game-1', '2026-03-01'),
      ],
    });

    const client = createTestClient();
    const result = await client.fetchInfiniteQuery(pastGamesInfiniteQueryOptions('user-1'));

    expect(result.pages[0].games.map((g) => g.id)).toEqual(['league-final', 'game-1']);
  });
});
