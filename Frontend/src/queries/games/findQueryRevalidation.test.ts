import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../queryKeys';
import type { AvailableGamesPage, AvailableGamesPageMeta } from './availableGamesPage';
import {
  prepareAvailableGamesDayIndexPage,
  startAvailableGamesDayIndexContinuation,
} from './availableGamesDayIndexContinuation';
import { scheduleFindQueryRevalidation } from './findQueryRevalidation';

afterEach(() => {
  vi.useRealTimers();
});

describe('findQueryRevalidation', () => {
  it('coalesces a socket burst into one exact refresh', async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const key = queryKeys.games.available('burst');
    client.setQueryData(key, { games: [], meta: {} });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    scheduleFindQueryRevalidation(client, key);
    scheduleFindQueryRevalidation(client, key);
    scheduleFindQueryRevalidation(client, key);
    await vi.advanceTimersByTimeAsync(200);

    expect(invalidate).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith(
      { queryKey: key, exact: true },
      { cancelRefetch: false },
    );
  });

  it('waits for an active continuation before refreshing the month', async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const key = queryKeys.games.available('walking');
    const page = prepareAvailableGamesDayIndexPage({
      games: [],
      meta: {
        take: 0,
        bound: 300,
        hasMore: false,
        nextCursor: null,
        truncated: false,
        dayIndex: [{ id: 'idx-1', startTime: '2026-08-01T10:00:00.000Z' }],
        dayIndexTruncated: true,
        dayIndexNextCursor: 'cursor-1',
      },
    });
    client.setQueryData(key, page);
    let resolvePage!: (meta: AvailableGamesPageMeta) => void;
    startAvailableGamesDayIndexContinuation({
      queryClient: client,
      queryKey: key,
      page,
      fetchPage: () => new Promise((resolve) => {
        resolvePage = resolve;
      }),
      config: { retryDelaysMs: [] },
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    scheduleFindQueryRevalidation(client, key);
    await vi.advanceTimersByTimeAsync(200);
    expect(invalidate).not.toHaveBeenCalled();

    resolvePage({
      take: 0,
      bound: 300,
      hasMore: false,
      nextCursor: null,
      truncated: false,
      dayIndex: [{ id: 'idx-2', startTime: '2026-08-02T10:00:00.000Z' }],
      dayIndexTruncated: false,
      dayIndexNextCursor: null,
    });
    await vi.runAllTimersAsync();

    expect(invalidate).toHaveBeenCalledOnce();
    expect(client.getQueryData<AvailableGamesPage>(key)?.meta.dayIndex).toHaveLength(2);
  });

  it('allows only one queued refresh while a refresh is active', async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const key = queryKeys.games.available('queued');
    client.setQueryData(key, { games: [], meta: {} });
    let resolveFirst!: () => void;
    const invalidate = vi.spyOn(client, 'invalidateQueries')
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce();

    scheduleFindQueryRevalidation(client, key);
    await vi.advanceTimersByTimeAsync(200);
    expect(invalidate).toHaveBeenCalledOnce();

    scheduleFindQueryRevalidation(client, key);
    scheduleFindQueryRevalidation(client, key);
    scheduleFindQueryRevalidation(client, key);
    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(200);

    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});
