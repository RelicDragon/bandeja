// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

import { useAvailableGamesQuery, type AvailableGamesQueryParams } from './useAvailableGamesQuery';
import type { AvailableGamesPage } from './availableGamesPage';

/**
 * Drives the real `loadMore` through the hook. The sibling suite asserts the
 * merge contract by reimplementing it, which left the actual function — and its
 * identity stability, which the Find section's memoised props depend on —
 * uncovered.
 */

function sampleGame(id: string, startTime: string): Game {
  return { id, startTime } as Game;
}

const baseParams: AvailableGamesQueryParams = {
  userId: 'user-1',
  sport: 'PADEL',
  startDate: new Date('2026-06-01T00:00:00.000Z'),
  endDate: new Date('2026-06-30T00:00:00.000Z'),
  indexOnly: false,
};

let root: Root;
let client: QueryClient;
let latest: ReturnType<typeof useAvailableGamesQuery>;
const seenLoadMore: Array<() => Promise<void>> = [];
let setSportExternally: (sport: string) => void;

function Probe({ initialSport }: { initialSport: string }) {
  const [sport, setSport] = useState(initialSport);
  const [, bump] = useState(0);
  setSportExternally = setSport;
  rerender = () => bump((n) => n + 1);
  const result = useAvailableGamesQuery({ ...baseParams, sport }, { enabled: true });
  latest = result;
  if (seenLoadMore[seenLoadMore.length - 1] !== result.loadMore) {
    seenLoadMore.push(result.loadMore);
  }
  return <span>{result.data?.games.length ?? -1}</span>;
}

let rerender: () => void;

async function mount(initialSport = 'PADEL') {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe initialSport={initialSport} />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('useAvailableGamesQuery loadMore', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    seenLoadMore.length = 0;
    getAvailableGames.mockReset();
    getAvailableGamesEnrichment.mockReset();
    getAvailableGamesEnrichment.mockResolvedValue({ data: { byGameId: {} } });
    root = createRoot(document.createElement('div'));
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    act(() => root.unmount());
    client.clear();
  });

  it('appends the next page and preserves the first page dayIndex', async () => {
    getAvailableGames
      .mockResolvedValueOnce({
        data: [sampleGame('g1', '2026-06-01T10:00:00.000Z')],
        meta: {
          take: 300, bound: 300, hasMore: true, nextCursor: 'cur-1', truncated: true,
          dayIndex: [{ id: 'idx1', startTime: '2026-06-01T10:00:00.000Z' }],
          dayIndexTruncated: false,
        },
      })
      .mockResolvedValueOnce({
        data: [sampleGame('g2', '2026-06-02T10:00:00.000Z')],
        meta: { take: 300, bound: 300, hasMore: false, nextCursor: null, truncated: false },
      });

    await mount();
    expect(latest.data?.games.map((g) => g.id)).toEqual(['g1']);

    await act(async () => { await latest.loadMore(); });

    expect(getAvailableGames.mock.calls[1][0]).toEqual(
      expect.objectContaining({ cursor: 'cur-1' }),
    );
    const page = client.getQueryData<AvailableGamesPage>(
      client.getQueryCache().getAll()[0].queryKey,
    );
    expect(page?.games.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(page?.meta.dayIndex?.map((r) => r.id)).toEqual(['idx1']);
    expect(page?.meta.hasMore).toBe(false);
  });

  it('keeps a stable identity across re-renders so memoised props survive', async () => {
    getAvailableGames.mockResolvedValue({
      data: [sampleGame('g1', '2026-06-01T10:00:00.000Z')],
      meta: { take: 300, bound: 300, hasMore: true, nextCursor: 'cur-1', truncated: false },
    });

    await mount();
    const afterMount = seenLoadMore.length;

    act(() => rerender());
    act(() => rerender());

    // No new identity from plain re-renders.
    expect(seenLoadMore.length).toBe(afterMount);
  });

  it('takes a new identity when the query key changes', async () => {
    getAvailableGames.mockResolvedValue({
      data: [sampleGame('g1', '2026-06-01T10:00:00.000Z')],
      meta: { take: 300, bound: 300, hasMore: true, nextCursor: 'cur-1', truncated: false },
    });

    await mount();
    const before = seenLoadMore.length;

    await act(async () => { setSportExternally('TENNIS'); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(seenLoadMore.length).toBeGreaterThan(before);
  });

  it('no-ops when there is no next cursor', async () => {
    getAvailableGames.mockResolvedValue({
      data: [sampleGame('g1', '2026-06-01T10:00:00.000Z')],
      meta: { take: 300, bound: 300, hasMore: false, nextCursor: null, truncated: false },
    });

    await mount();
    expect(getAvailableGames).toHaveBeenCalledTimes(1);

    await act(async () => { await latest.loadMore(); });

    expect(getAvailableGames).toHaveBeenCalledTimes(1);
  });

  it('no-ops for an index-only month range', async () => {
    getAvailableGames.mockResolvedValue({
      data: [],
      meta: {
        take: 300, bound: 300, hasMore: true, nextCursor: 'cur-1', truncated: true,
        dayIndex: [{ id: 'idx1', startTime: '2026-06-01T10:00:00.000Z' }],
      },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <IndexOnlyProbe />
        </QueryClientProvider>,
      );
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(getAvailableGames).toHaveBeenCalledTimes(1);

    await act(async () => { await latest.loadMore(); });

    // indexOnly months paginate their dayIndex through the continuation, not here.
    expect(getAvailableGames).toHaveBeenCalledTimes(1);
  });
});

function IndexOnlyProbe() {
  const result = useAvailableGamesQuery({ ...baseParams, indexOnly: true }, { enabled: true });
  latest = result;
  return <span>{result.data?.meta.dayIndex?.length ?? -1}</span>;
}
