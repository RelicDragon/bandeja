import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { prefetchFindNeighborDays } from './prefetchFindNeighborDays';
import { availableGamesQueryOptions } from './useAvailableGamesQuery';

describe('prefetchFindNeighborDays', () => {
  it('prefetches D±1 without cancelling an in-flight refetch', () => {
    const prefetchQuery = vi.fn().mockResolvedValue(undefined);
    const queryClient = { prefetchQuery } as unknown as QueryClient;
    const day = new Date('2026-08-22T00:00:00');

    prefetchFindNeighborDays(
      queryClient,
      { userId: 'u1', sport: 'PADEL', indexOnly: true },
      day,
      undefined,
      null,
      { startKey: '2026-07-27', endKey: '2026-09-06' },
    );

    expect(prefetchQuery).toHaveBeenCalledTimes(2);
    for (const [opts] of prefetchQuery.mock.calls) {
      expect(opts.cancelRefetch).toBe(false);
      expect(opts.networkMode).toBe('always');
    }

    const prev = availableGamesQueryOptions({
      userId: 'u1',
      sport: 'PADEL',
      startDate: new Date('2026-08-21T00:00:00'),
      endDate: new Date('2026-08-21T00:00:00'),
      indexOnly: false,
    }).queryKey;
    const next = availableGamesQueryOptions({
      userId: 'u1',
      sport: 'PADEL',
      startDate: new Date('2026-08-23T00:00:00'),
      endDate: new Date('2026-08-23T00:00:00'),
      indexOnly: false,
    }).queryKey;
    expect(prefetchQuery.mock.calls.map(([opts]) => opts.queryKey)).toEqual([prev, next]);
  });
});
