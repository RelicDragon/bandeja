import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../queryKeys';
import type { AvailableGamesPage, AvailableGamesPageMeta } from './availableGamesPage';
import {
  prepareAvailableGamesDayIndexPage,
  startAvailableGamesDayIndexContinuation,
  waitForAvailableGamesDayIndexContinuation,
} from './availableGamesDayIndexContinuation';

function partialPage(
  id = 'idx-1',
  cursor = 'cursor-1',
): AvailableGamesPage {
  return prepareAvailableGamesDayIndexPage({
    games: [],
    meta: {
      take: 0,
      bound: 300,
      hasMore: false,
      nextCursor: null,
      truncated: false,
      dayIndex: [{ id, startTime: '2026-08-01T10:00:00.000Z', dateKey: '2026-08-01' }],
      dayIndexTruncated: true,
      dayIndexNextCursor: cursor,
    },
  });
}

function continuationMeta(input: {
  rows?: AvailableGamesPageMeta['dayIndex'];
  cursor?: string | null;
  truncated?: boolean;
}): AvailableGamesPageMeta {
  return {
    take: 0,
    bound: 300,
    hasMore: false,
    nextCursor: null,
    truncated: false,
    dayIndex: input.rows ?? [],
    dayIndexTruncated: input.truncated ?? Boolean(input.cursor),
    dayIndexNextCursor: input.cursor ?? null,
  };
}

async function waitForJob(client: QueryClient, key: ReturnType<typeof queryKeys.games.available>) {
  const job = waitForAvailableGamesDayIndexContinuation(client, key);
  expect(job).not.toBeNull();
  await job;
}

describe('availableGamesDayIndexContinuation', () => {
  it('incrementally de-duplicates pages and clears truncation only at the terminal page', async () => {
    const client = new QueryClient();
    const key = queryKeys.games.available('month');
    const page = partialPage();
    client.setQueryData(key, page);
    const fetchPage = vi.fn()
      .mockResolvedValueOnce(continuationMeta({
        rows: [
          { id: 'idx-1', startTime: '2026-08-01T11:00:00.000Z', dateKey: '2026-08-02' },
          { id: 'idx-2', startTime: '2026-08-02T10:00:00.000Z', dateKey: '2026-08-02' },
        ],
        cursor: 'cursor-2',
      }))
      .mockResolvedValueOnce(continuationMeta({
        rows: [
          { id: 'idx-3', startTime: '2026-08-03T10:00:00.000Z', dateKey: '2026-08-03' },
        ],
        cursor: null,
        truncated: false,
      }));

    startAvailableGamesDayIndexContinuation({
      queryClient: client,
      queryKey: key,
      page,
      fetchPage,
      config: { retryDelaysMs: [] },
    });
    await waitForJob(client, key);

    const result = client.getQueryData<AvailableGamesPage>(key)!;
    expect(fetchPage.mock.calls.map(([cursor]) => cursor)).toEqual(['cursor-1', 'cursor-2']);
    expect(result.meta.dayIndex?.map((row) => row.id)).toEqual(['idx-1', 'idx-2', 'idx-3']);
    expect(result.meta.dayIndex?.[0].dateKey).toBe('2026-08-02');
    expect(result.meta.dayIndexTruncated).toBe(false);
    expect(result.meta.dayIndexNextCursor).toBeNull();
    expect(result.meta.dayIndexContinuation).toMatchObject({
      status: 'complete',
      pagesLoaded: 3,
    });
  });

  it('keeps page 1 and retries the failed cursor without restarting the query', async () => {
    const client = new QueryClient();
    const key = queryKeys.games.available('failure');
    const page = partialPage();
    client.setQueryData(key, page);
    const fetchPage = vi.fn().mockRejectedValue(new Error('network'));

    startAvailableGamesDayIndexContinuation({
      queryClient: client,
      queryKey: key,
      page,
      fetchPage,
      config: { retryDelaysMs: [0, 0] },
    });
    await waitForJob(client, key);

    const result = client.getQueryData<AvailableGamesPage>(key)!;
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.every(([cursor]) => cursor === 'cursor-1')).toBe(true);
    expect(result.meta.dayIndex?.map((row) => row.id)).toEqual(['idx-1']);
    expect(result.meta.dayIndexTruncated).toBe(true);
    expect(result.meta.dayIndexNextCursor).toBe('cursor-1');
    expect(result.meta.dayIndexContinuation).toMatchObject({
      status: 'failed',
      failedCursor: 'cursor-1',
      pagesLoaded: 1,
      resumeEligible: true,
      resumeAttempts: 0,
    });
  });

  it('stops at the page budget and preserves the next cursor as partial', async () => {
    const client = new QueryClient();
    const key = queryKeys.games.available('budget');
    const page = partialPage();
    client.setQueryData(key, page);
    const fetchPage = vi.fn().mockResolvedValue(continuationMeta({
      rows: [{ id: 'idx-2', startTime: '2026-08-02T10:00:00.000Z' }],
      cursor: 'cursor-2',
    }));

    startAvailableGamesDayIndexContinuation({
      queryClient: client,
      queryKey: key,
      page,
      fetchPage,
      config: { maxContinuationPages: 1, retryDelaysMs: [] },
    });
    await waitForJob(client, key);

    const result = client.getQueryData<AvailableGamesPage>(key)!;
    expect(fetchPage).toHaveBeenCalledOnce();
    expect(result.meta.dayIndex?.map((row) => row.id)).toEqual(['idx-1', 'idx-2']);
    expect(result.meta.dayIndexTruncated).toBe(true);
    expect(result.meta.dayIndexNextCursor).toBe('cursor-2');
    expect(result.meta.dayIndexContinuation?.status).toBe('budget-exhausted');
  });

  it('stops a repeated cursor without discarding the page that exposed it', async () => {
    const client = new QueryClient();
    const key = queryKeys.games.available('repeated');
    const page = partialPage();
    client.setQueryData(key, page);
    const fetchPage = vi.fn().mockResolvedValue(continuationMeta({
      rows: [{ id: 'idx-2', startTime: '2026-08-02T10:00:00.000Z' }],
      cursor: 'cursor-1',
    }));

    startAvailableGamesDayIndexContinuation({
      queryClient: client,
      queryKey: key,
      page,
      fetchPage,
      config: { retryDelaysMs: [] },
    });
    await waitForJob(client, key);

    const result = client.getQueryData<AvailableGamesPage>(key)!;
    expect(fetchPage).toHaveBeenCalledOnce();
    expect(result.meta.dayIndex?.map((row) => row.id)).toEqual(['idx-1', 'idx-2']);
    expect(result.meta.dayIndexTruncated).toBe(true);
    expect(result.meta.dayIndexNextCursor).toBe('cursor-1');
    expect(result.meta.dayIndexContinuation).toMatchObject({
      status: 'failed',
      failedCursor: 'cursor-1',
      resumeEligible: false,
    });
  });

  it('rejects a stale generation that resolves after a new page-1 identity', async () => {
    const client = new QueryClient();
    const key = queryKeys.games.available('identity');
    const oldPage = partialPage('old');
    client.setQueryData(key, oldPage);
    let resolveOld!: (meta: AvailableGamesPageMeta) => void;
    const oldFetch = vi.fn(() => new Promise<AvailableGamesPageMeta>((resolve) => {
      resolveOld = resolve;
    }));
    startAvailableGamesDayIndexContinuation({
      queryClient: client,
      queryKey: key,
      page: oldPage,
      fetchPage: oldFetch,
      config: { retryDelaysMs: [] },
    });

    const freshPage = partialPage('fresh');
    client.setQueryData(key, freshPage);
    const freshFetch = vi.fn().mockResolvedValue(continuationMeta({
      rows: [{ id: 'fresh-tail', startTime: '2026-08-02T10:00:00.000Z' }],
      cursor: null,
      truncated: false,
    }));
    startAvailableGamesDayIndexContinuation({
      queryClient: client,
      queryKey: key,
      page: freshPage,
      fetchPage: freshFetch,
      config: { retryDelaysMs: [] },
    });
    await waitForJob(client, key);
    resolveOld(continuationMeta({
      rows: [{ id: 'stale-tail', startTime: '2026-08-03T10:00:00.000Z' }],
      cursor: null,
      truncated: false,
    }));
    await Promise.resolve();

    const result = client.getQueryData<AvailableGamesPage>(key)!;
    expect(result.meta.dayIndex?.map((row) => row.id)).toEqual(['fresh', 'fresh-tail']);
    expect(result.meta.dayIndexContinuation?.status).toBe('complete');
  });
});
