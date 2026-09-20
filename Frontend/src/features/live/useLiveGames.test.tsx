// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveRailGame } from '@/api/live';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

/**
 * PRD 349 — socket subscription lifecycle for the rail:
 * subscribe to exactly the visible cards on mount, unsubscribe every one on
 * unmount, refetch on reconnect, and caption (not blank) while disconnected.
 */

const rooms = vi.hoisted(() => ({
  retained: [] as string[],
  released: [] as string[],
  reconnectListeners: new Set<() => void>(),
  /** Ids whose join hangs until the test resolves it — an in-flight retain. */
  blocked: new Set<string>(),
  unblock: new Map<string, () => void>(),
}));

vi.mock('@/services/gameRoomMembership', () => ({
  retainGameRoom: async (id: string) => {
    if (rooms.blocked.has(id)) {
      await new Promise<void>((resolve) => rooms.unblock.set(id, resolve));
    }
    rooms.retained.push(id);
  },
  releaseGameRoom: (id: string) => {
    rooms.released.push(id);
  },
  onGameRoomsReconnected: (listener: () => void) => {
    rooms.reconnectListeners.add(listener);
    return () => rooms.reconnectListeners.delete(listener);
  },
}));

const socket = vi.hoisted(() => ({
  state: 'connected' as 'connected' | 'connecting' | 'disconnected',
  listeners: new Set<(s: string) => void>(),
}));

vi.mock('@/services/socketService', () => ({
  socketService: {
    getConnectionState: () => socket.state,
    onConnectionStateChange: (cb: (s: string) => void) => {
      socket.listeners.add(cb);
      return () => socket.listeners.delete(cb);
    },
  },
}));

const store = vi.hoisted(() => ({
  lastMatchLiveScoringUpdated: null as unknown,
}));

vi.mock('@/store/socketEventsStore', () => ({
  useSocketEventsStore: (selector: (s: typeof store) => unknown) => selector(store),
}));

const queryState = vi.hoisted(() => ({
  data: [] as unknown[],
  isLoading: false,
  refetchCount: 0,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: queryState.data,
    isLoading: queryState.isLoading,
    refetch: () => {
      queryState.refetchCount += 1;
      return Promise.resolve({ data: queryState.data });
    },
  }),
}));

import { useLiveGames } from './useLiveGames';

function makeGame(id: string, revision: number): LiveRailGame {
  return {
    id,
    name: null,
    sport: 'PADEL',
    entityType: 'GAME',
    affectsRating: true,
    startTime: '2026-09-20T11:00:00.000Z',
    cityId: 'city-1',
    cityName: 'Belgrade',
    clubId: null,
    clubName: null,
    clubAvatar: null,
    courtName: null,
    viewerIsPlaying: false,
    followedSeason: false,
    liveSummary: {
      matchId: `match-${id}`,
      courtName: null,
      currentSet: 1,
      sides: [
        {
          teamNumber: 1,
          players: [],
          setScores: [3],
          currentGameScore: '30',
          leading: true,
        },
        {
          teamNumber: 2,
          players: [],
          setScores: [1],
          currentGameScore: '15',
          leading: false,
        },
      ],
      startedAt: '2026-09-20T11:00:00.000Z',
      revision,
    },
  } as LiveRailGame;
}

let latest: ReturnType<typeof useLiveGames> | null = null;

function Probe() {
  latest = useLiveGames({ cityId: 'city-1', limit: 10 });
  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<Probe />));
}

function unmount() {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
}

beforeEach(() => {
  rooms.retained.length = 0;
  rooms.released.length = 0;
  rooms.reconnectListeners.clear();
  rooms.blocked.clear();
  rooms.unblock.clear();
  socket.state = 'connected';
  socket.listeners.clear();
  store.lastMatchLiveScoringUpdated = null;
  queryState.data = [];
  queryState.isLoading = false;
  queryState.refetchCount = 0;
  latest = null;
});

afterEach(() => {
  unmount();
});

describe('useLiveGames socket lifecycle', () => {
  it('retains exactly the visible rooms and releases them all on unmount', async () => {
    queryState.data = [makeGame('g1', 1), makeGame('g2', 1)];
    mount();
    await act(async () => {});

    expect(rooms.retained).toEqual(['g1', 'g2']);
    expect(rooms.released).toEqual([]);

    unmount();
    expect(rooms.released.sort()).toEqual(['g1', 'g2']);
  });

  it('releases only the rooms it actually retained', async () => {
    // Regression: the cleanup used to release every *visible* id, including
    // ones the interrupted retain loop never took. That drives another
    // subscriber's ref count to zero and silently leaves them the room.
    rooms.blocked.add('g2');
    queryState.data = [makeGame('g1', 1), makeGame('g2', 1), makeGame('g3', 1)];
    mount();
    await act(async () => {});
    expect(rooms.retained).toEqual(['g1']);

    // The 60 s refetch returns a different id list mid-loop.
    queryState.data = [makeGame('g4', 1)];
    act(() => root!.render(<Probe />));
    await act(async () => {});

    expect(rooms.released).toEqual(['g1']);
    expect(rooms.retained).toEqual(['g1', 'g4']);

    // When the stalled join finally lands it releases itself, so the count
    // stays balanced rather than leaking a room.
    await act(async () => {
      rooms.unblock.get('g2')?.();
    });
    expect(rooms.retained).toEqual(['g1', 'g4', 'g2']);
    expect(rooms.released).toEqual(['g1', 'g2']);
  });

  it('retains nothing when the rail is empty', async () => {
    queryState.data = [];
    mount();
    await act(async () => {});
    expect(rooms.retained).toEqual([]);
  });

  it('applies a newer score frame without a refetch', async () => {
    queryState.data = [makeGame('g1', 1)];
    mount();
    await act(async () => {});

    store.lastMatchLiveScoringUpdated = {
      gameId: 'g1',
      matchId: 'match-g1',
      receivedAt: 1,
      liveScoring: {
        v: 1,
        revision: 2,
        updatedAt: '2026-09-20T12:00:00.000Z',
        state: {
          mode: 'classic',
          activeSetIndex: 0,
          sets: [{ teamA: 4, teamB: 1 }],
          classic: { pointState: { kind: 'regular', teamA: 40, teamB: 15 } },
        },
      },
    };
    act(() => root!.render(<Probe />));
    await act(async () => {});

    expect(latest?.games[0].liveSummary.revision).toBe(2);
    expect(latest?.games[0].liveSummary.sides[0].setScores).toEqual([4]);
    expect(latest?.games[0].liveSummary.sides[0].currentGameScore).toBe('40');
    expect(queryState.refetchCount).toBe(0);
  });

  it('drops a frame that is not newer than what is on screen', async () => {
    queryState.data = [makeGame('g1', 5)];
    mount();
    await act(async () => {});

    store.lastMatchLiveScoringUpdated = {
      gameId: 'g1',
      matchId: 'match-g1',
      receivedAt: 1,
      liveScoring: {
        v: 1,
        revision: 4,
        updatedAt: '2026-09-20T11:59:00.000Z',
        state: { mode: 'classic', activeSetIndex: 0, sets: [{ teamA: 0, teamB: 0 }] },
      },
    };
    act(() => root!.render(<Probe />));
    await act(async () => {});

    expect(latest?.games[0].liveSummary.revision).toBe(5);
    expect(latest?.games[0].liveSummary.sides[0].setScores).toEqual([3]);
  });

  it('refetches on reconnect, because missed frames cannot be replayed', async () => {
    queryState.data = [makeGame('g1', 1)];
    mount();
    await act(async () => {});

    expect(rooms.reconnectListeners.size).toBe(1);
    act(() => {
      for (const listener of rooms.reconnectListeners) listener();
    });
    expect(queryState.refetchCount).toBe(1);
  });

  it('reports reconnecting while the socket is down and cards are on screen', async () => {
    queryState.data = [makeGame('g1', 1)];
    mount();
    await act(async () => {});
    expect(latest?.isReconnecting).toBe(false);

    socket.state = 'disconnected';
    act(() => {
      for (const listener of socket.listeners) listener('disconnected');
    });
    expect(latest?.isReconnecting).toBe(true);
    // The scores are still there — frozen, not blanked.
    expect(latest?.games[0].liveSummary.sides[0].setScores).toEqual([3]);
  });

  it('never claims to be reconnecting with an empty rail', async () => {
    queryState.data = [];
    socket.state = 'disconnected';
    mount();
    await act(async () => {});
    expect(latest?.isReconnecting).toBe(false);
  });
});
