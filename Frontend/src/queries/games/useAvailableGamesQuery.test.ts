import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Game } from '@/types';

const { getAvailableGames, getAvailableGamesEnrichment } = vi.hoisted(() => ({
  getAvailableGames: vi.fn(),
  getAvailableGamesEnrichment: vi.fn(),
}));

vi.mock('@/api', () => ({
  gamesApi: {
    getAvailableGames: (...args: unknown[]) => getAvailableGames(...args),
    getAvailableGamesEnrichment: (...args: unknown[]) => getAvailableGamesEnrichment(...args),
  },
}));

import { availableGamesQueryOptions } from './useAvailableGamesQuery';
import { buildAvailableGamesFilterHash } from '../queryKeys';
import type { AvailableGamesPage } from './availableGamesPage';

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
    getAvailableGamesEnrichment.mockReset();
    getAvailableGames.mockResolvedValue({
      data: [sampleGame('g1', '2026-06-01')],
      meta: { take: 300, bound: 300, hasMore: false, nextCursor: null, truncated: false },
    });
    getAvailableGamesEnrichment.mockResolvedValue({ data: { byGameId: {} } });
  });

  it('fetches once per filterHash within stale window', async () => {
    const client = createTestClient();
    const params = { userId: 'user-1', sport: 'PADEL', cityId: 'city-1' };
    const options = availableGamesQueryOptions(params);

    await client.fetchQuery(options);
    await client.fetchQuery(options);

    expect(getAvailableGames).toHaveBeenCalledTimes(1);
  });

  it('refetches when filterHash changes including structural', async () => {
    const client = createTestClient();
    const padel = availableGamesQueryOptions({ userId: 'user-1', sport: 'PADEL' });
    const tennis = availableGamesQueryOptions({ userId: 'user-1', sport: 'TENNIS' });
    const clubs = availableGamesQueryOptions({
      userId: 'user-1',
      sport: 'PADEL',
      structural: { mode: 'calendar', clubIds: 'c1' },
    });

    await client.fetchQuery(padel);
    await client.fetchQuery(tennis);
    await client.fetchQuery(clubs);

    expect(getAvailableGames).toHaveBeenCalledTimes(3);
    expect(padel.queryKey[2]).toBe(buildAvailableGamesFilterHash({ sport: 'PADEL' }));
    expect(clubs.queryKey[2]).not.toBe(padel.queryKey[2]);
  });

  it('passes structural + calendar mode api params and stores page shape', async () => {
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
        structural: {
          mode: 'calendar',
          hideBar: true,
          availableSlots: true,
        },
      }),
    );

    expect(getAvailableGames).toHaveBeenCalledWith(
      expect.objectContaining({
        showArchived: false,
        includeLeagues: true,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        sport: 'PADEL',
        showPrivateGames: true,
        mode: 'calendar',
        format: 'card',
        hideBar: true,
        availableSlots: true,
      }),
    );

    const page = client.getQueryData(
      availableGamesQueryOptions({
        userId: 'user-1',
        startDate,
        endDate,
        includeLeagues: true,
        sport: 'PADEL',
        isAdmin: true,
        showPrivateGames: true,
        structural: { mode: 'calendar', hideBar: true, availableSlots: true },
      }).queryKey,
    ) as AvailableGamesPage;
    expect(page.games[0].id).toBe('g1');
    expect(page.meta.hasMore).toBe(false);
  });

  it('prefetch options share the same query key as live options', () => {
    const params = {
      userId: 'user-1',
      sport: 'PADEL',
      cityId: 'c1',
      structural: { mode: 'calendar' as const },
    };
    const live = availableGamesQueryOptions(params, true);
    const prefetch = availableGamesQueryOptions(params, true);
    expect(live.queryKey).toEqual(prefetch.queryKey);
  });

  it('returns core page without awaiting enrichment (non-blocking TTFP)', async () => {
    let resolveEnrich!: (v: unknown) => void;
    getAvailableGamesEnrichment.mockReturnValue(
      new Promise((resolve) => {
        resolveEnrich = resolve;
      }),
    );
    getAvailableGames.mockResolvedValue({
      data: [sampleGame('g1', '2026-06-01')],
      meta: {
        take: 300,
        bound: 300,
        hasMore: false,
        nextCursor: null,
        truncated: false,
        dayIndex: [
          {
            id: 'g1',
            startTime: '2026-06-01T10:00:00.000Z',
            entityType: 'GAME',
            minLevel: 2,
            maxLevel: 5,
            maxParticipants: 4,
            genderTeams: 'ANY',
            trainerId: null,
            clubId: null,
            isPublic: true,
            timeIsSet: true,
            ownerUserId: null,
          },
        ],
      },
    });

    const client = createTestClient();
    const page = (await client.fetchQuery(
      availableGamesQueryOptions({ userId: 'user-1', sport: 'PADEL' }),
    )) as AvailableGamesPage;

    expect(page.games).toHaveLength(1);
    expect(page.meta.dayIndex).toHaveLength(1);
    expect(getAvailableGamesEnrichment).toHaveBeenCalled();
    resolveEnrich({ data: { byGameId: {} } });
  });

  it('stores dayIndex on first page so busy-city badges survive pagination', async () => {
    const client = createTestClient();
    getAvailableGames.mockResolvedValueOnce({
      data: [sampleGame('g1', '2026-06-01')],
      meta: {
        take: 300,
        bound: 300,
        hasMore: true,
        nextCursor: 'cur-1',
        truncated: true,
        dayIndex: [{ id: 'g1', startTime: '2026-06-01T10:00:00.000Z' }],
      },
    });

    const page = (await client.fetchQuery(
      availableGamesQueryOptions({ userId: 'user-1', sport: 'PADEL' }),
    )) as AvailableGamesPage;

    expect(page.meta.hasMore).toBe(true);
    expect(page.meta.nextCursor).toBe('cur-1');
    expect(page.meta.bound).toBe(300);
    expect(page.meta.dayIndex?.[0].id).toBe('g1');
  });

  it('day-scoped options omit keepPreviousData to avoid cross-day empty flash', () => {
    const day = new Date('2026-06-15T00:00:00');
    const dayOpts = availableGamesQueryOptions({
      userId: 'user-1',
      startDate: day,
      endDate: day,
      sport: 'PADEL',
    });
    const monthOpts = availableGamesQueryOptions({
      userId: 'user-1',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-30'),
      sport: 'PADEL',
    });
    expect(dayOpts.placeholderData).toBeUndefined();
    expect(monthOpts.placeholderData).toBeTypeOf('function');
  });

  it('loadMore appends games and preserves dayIndex from the first page', async () => {
    const client = createTestClient();
    getAvailableGames
      .mockResolvedValueOnce({
        data: [sampleGame('g1', '2026-06-01')],
        meta: {
          take: 300,
          bound: 300,
          hasMore: true,
          nextCursor: 'cur-1',
          truncated: true,
          dayIndex: [{ id: 'idx1', startTime: '2026-06-01T10:00:00.000Z' }],
          dayIndexTruncated: false,
        },
      })
      .mockResolvedValueOnce({
        data: [sampleGame('g2', '2026-06-02')],
        meta: {
          take: 300,
          bound: 300,
          hasMore: false,
          nextCursor: null,
          truncated: false,
        },
      });

    const opts = availableGamesQueryOptions({ userId: 'user-1', sport: 'PADEL' });
    await client.fetchQuery(opts);
    const first = client.getQueryData(opts.queryKey) as AvailableGamesPage;
    expect(first.meta.dayIndex?.[0].id).toBe('idx1');

    // Same merge contract as useAvailableGamesQuery.loadMore.
    const response = await getAvailableGames({ cursor: first.meta.nextCursor! });
    const { mergeAvailableGamesPages, parseAvailableGamesMeta } = await import(
      './availableGamesPage'
    );
    const meta = parseAvailableGamesMeta(response.meta);
    client.setQueryData(opts.queryKey, {
      games: mergeAvailableGamesPages(first.games, response.data),
      meta: {
        ...meta,
        dayIndex: first.meta.dayIndex,
        dayIndexTruncated: first.meta.dayIndexTruncated,
      },
    });

    const next = client.getQueryData(opts.queryKey) as AvailableGamesPage;
    expect(getAvailableGames).toHaveBeenCalledTimes(2);
    expect(getAvailableGames.mock.calls[1][0]).toEqual(
      expect.objectContaining({ cursor: 'cur-1' }),
    );
    expect(next.games.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(next.meta.dayIndex).toEqual(first.meta.dayIndex);
    expect(next.meta.hasMore).toBe(false);
  });

  it('chunks enrichment across full painted pages', async () => {
    const { attachAvailableGamesEnrichment, AVAILABLE_ENRICH_CHUNK } = await import(
      '@/utils/attachAvailableGamesEnrichment'
    );
    expect(AVAILABLE_ENRICH_CHUNK).toBe(100);
    getAvailableGamesEnrichment.mockResolvedValue({ data: { byGameId: {} } });
    const client = createTestClient();
    const games = Array.from({ length: 250 }, (_, i) => sampleGame(`g${i}`, '2026-06-01'));
    await attachAvailableGamesEnrichment(client, ['games', 'available', 'h'], games);
    expect(getAvailableGamesEnrichment).toHaveBeenCalledTimes(3);
  });
});
