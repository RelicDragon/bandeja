// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvailableGamesPageMeta } from './availableGamesPage';

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

import { useAvailableGamesQuery } from './useAvailableGamesQuery';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function firstMeta(): AvailableGamesPageMeta {
  return {
    take: 0,
    bound: 300,
    hasMore: false,
    nextCursor: null,
    truncated: false,
    dayIndex: [{ id: 'idx-1', startTime: '2026-08-01T10:00:00.000Z' } as never],
    dayIndexTruncated: true,
    dayIndexNextCursor: 'cursor-1',
  };
}

describe('useAvailableGamesQuery progressive month index', () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;
  let latest: ReturnType<typeof useAvailableGamesQuery> | undefined;

  beforeEach(() => {
    getAvailableGames.mockReset();
    getAvailableGamesEnrichment.mockReset();
    getAvailableGamesEnrichment.mockResolvedValue({ data: { byGameId: {} } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    latest = undefined;
  });

  afterEach(() => {
    try {
      act(() => root.unmount());
    } catch {
      // A test may already have unmounted to assert cancellation.
    }
    container.remove();
    client.clear();
    vi.useRealTimers();
  });

  function Probe({
    indexOnly = true,
    month = 7,
  }: {
    indexOnly?: boolean;
    month?: number;
  }) {
    latest = useAvailableGamesQuery({
      userId: 'user-1',
      cityId: 'city-1',
      startDate: new Date(2026, month, 1),
      endDate: new Date(2026, month + 1, 0),
      indexOnly,
    });
    return null;
  }

  async function renderProbe(indexOnly = true, month = 7) {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe indexOnly={indexOnly} month={month} />
        </QueryClientProvider>,
      );
    });
  }

  async function renderAndFlush(indexOnly = true, month = 7) {
    await renderProbe(indexOnly, month);
    for (let i = 0; i < 10 && !latest?.data; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  it('paints page 1 while page 2 is pending, then merges page 2', async () => {
    let resolveContinuation!: (value: { data: []; meta: AvailableGamesPageMeta }) => void;
    getAvailableGames
      .mockResolvedValueOnce({ data: [], meta: firstMeta() })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveContinuation = resolve;
      }));

    await renderAndFlush();

    expect(latest?.data?.meta.dayIndex?.map((row) => row.id)).toEqual(['idx-1']);
    expect(latest?.data?.meta.dayIndexTruncated).toBe(true);
    expect(latest?.isFetching).toBe(false);
    expect(getAvailableGames).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveContinuation({
        data: [],
        meta: {
          ...firstMeta(),
          dayIndex: [{ id: 'idx-2', startTime: '2026-08-02T10:00:00.000Z' } as never],
          dayIndexTruncated: false,
          dayIndexNextCursor: null,
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    for (let i = 0; i < 10 && latest?.data?.meta.dayIndexTruncated; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    expect(latest?.data?.meta.dayIndex?.map((row) => row.id)).toEqual(['idx-1', 'idx-2']);
    expect(latest?.data?.meta.dayIndexTruncated).toBe(false);
    expect(latest?.data?.meta.dayIndexContinuation?.status).toBe('complete');
  });

  it('aborts the continuation when the last observer unmounts', async () => {
    let continuationSignal: AbortSignal | undefined;
    getAvailableGames
      .mockResolvedValueOnce({ data: [], meta: firstMeta() })
      .mockImplementationOnce((_params, options: { signal: AbortSignal }) => {
        continuationSignal = options.signal;
        return new Promise(() => {});
      });

    await renderAndFlush();
    expect(continuationSignal?.aborted).toBe(false);

    act(() => root.unmount());
    expect(continuationSignal?.aborted).toBe(true);
    const cached = client.getQueryCache().getAll()[0]?.state.data as {
      meta?: { dayIndexContinuation?: { status?: string } };
    };
    expect(cached.meta?.dayIndexContinuation?.status).toBe('cancelled');
  });

  it('continues a legacy multi-day card response through scalar index-only pages', async () => {
    getAvailableGames
      .mockResolvedValueOnce({
        data: [{ id: 'card-1', startTime: '2026-08-01T10:00:00.000Z' }],
        meta: firstMeta(),
      })
      .mockResolvedValueOnce({
        data: [],
        meta: {
          ...firstMeta(),
          dayIndex: [{ id: 'idx-2', startTime: '2026-08-02T10:00:00.000Z' } as never],
          dayIndexTruncated: false,
          dayIndexNextCursor: null,
        },
      });

    await renderAndFlush(false);
    for (let i = 0; i < 10 && latest?.data?.meta.dayIndexTruncated; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    expect(getAvailableGames.mock.calls[0][0]).not.toEqual(
      expect.objectContaining({ indexOnly: true }),
    );
    expect(getAvailableGames.mock.calls[1][0]).toEqual(
      expect.objectContaining({ indexOnly: true, cursor: 'cursor-1' }),
    );
    expect(latest?.data?.games.map((game) => game.id)).toEqual(['card-1']);
    expect(latest?.data?.meta.dayIndex?.map((row) => row.id)).toEqual(['idx-1', 'idx-2']);
    expect(latest?.data?.meta.dayIndexTruncated).toBe(false);
  });

  it('does not start a continuation from keepPreviousData while changing months', async () => {
    const permanentFailure = Object.assign(new Error('bad cursor'), {
      response: { status: 400 },
    });
    getAvailableGames
      .mockResolvedValueOnce({ data: [], meta: firstMeta() })
      .mockRejectedValueOnce(permanentFailure)
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementation(() => new Promise(() => {}));

    await renderAndFlush();
    for (let i = 0; i < 10 && latest?.data?.meta.dayIndexContinuation?.status !== 'failed'; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    expect(getAvailableGames).toHaveBeenCalledTimes(2);

    await renderProbe(true, 8);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latest?.isPlaceholderData).toBe(true);
    expect(getAvailableGames).toHaveBeenCalledTimes(3);
    expect(getAvailableGames.mock.calls[2][0]).not.toEqual(
      expect.objectContaining({ cursor: expect.any(String) }),
    );
  });

  it('resumes a retryable terminal failure from its cursor without refetching page 1', async () => {
    vi.useFakeTimers();
    const networkFailure = new Error('network');
    getAvailableGames
      .mockResolvedValueOnce({ data: [], meta: firstMeta() })
      .mockRejectedValueOnce(networkFailure)
      .mockRejectedValueOnce(networkFailure)
      .mockRejectedValueOnce(networkFailure)
      .mockResolvedValueOnce({
        data: [],
        meta: {
          ...firstMeta(),
          dayIndex: [{ id: 'idx-2', startTime: '2026-08-02T10:00:00.000Z' } as never],
          dayIndexTruncated: false,
          dayIndexNextCursor: null,
        },
      });

    await renderProbe();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      await Promise.resolve();
    });

    expect(getAvailableGames).toHaveBeenCalledTimes(5);
    expect(getAvailableGames.mock.calls[0][0]).not.toEqual(
      expect.objectContaining({ cursor: expect.any(String) }),
    );
    for (const call of getAvailableGames.mock.calls.slice(1)) {
      expect(call[0]).toEqual(expect.objectContaining({ cursor: 'cursor-1' }));
    }
    expect(latest?.data?.meta.dayIndex?.map((row) => row.id)).toEqual(['idx-1', 'idx-2']);
    expect(latest?.data?.meta.dayIndexContinuation).toMatchObject({
      status: 'complete',
      resumeAttempts: 1,
    });
  });
});
