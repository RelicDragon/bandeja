import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
vi.mock('@/services/socketService', () => ({
  socketService: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('@/api/me', () => ({
  clearMyTabCache: vi.fn(),
}));

import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useNetworkStore } from '@/utils/networkStatus';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from './queryKeys';
import {
  setupQueryInvalidationBridge,
  teardownQueryInvalidationBridge,
} from './queryInvalidationBridge';
import type { Game } from '@/types';
import type { MyGamesData } from './games/useMyGamesQuery';
import { getGamesFromAvailableCache } from './games/availableGamesCache';
import { EMPTY_AVAILABLE_META, type AvailableGamesPage } from './games/availableGamesPage';

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function page(games: Game[]): AvailableGamesPage {
  return { games, meta: EMPTY_AVAILABLE_META };
}

describe('queryInvalidationBridge', () => {
  beforeEach(() => {
    teardownQueryInvalidationBridge();
    useNetworkStore.getState().setOnline(true);
    useAuthStore.setState({ user: { id: 'u1' } as never });
    useSocketEventsStore.setState({
      lastGameUpdate: null,
      lastNewInvite: null,
      lastInviteDeleted: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not blanket-invalidate all games queries on game update', () => {
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const availKey = queryKeys.games.available('hash');
    client.setQueryData(availKey, page([{ id: 'other' } as Game]));

    setupQueryInvalidationBridge(client);

    useSocketEventsStore.setState({
      lastGameUpdate: {
        gameId: 'g-1',
        senderId: 'user-2',
        game: { id: 'g-1', name: 'updated' } as Game,
      },
    });

    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['games'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.games.my('u1'),
    });
    expect(getGamesFromAvailableCache(client.getQueryData(availKey))?.[0].id).toBe('other');
  });

  it('patches Find available when game id is already cached', () => {
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const availKey = queryKeys.games.available('hash');
    client.setQueryData(availKey, page([{ id: 'g-1', name: 'old' } as Game]));
    client.setQueryData<MyGamesData>(queryKeys.games.my('u1'), {
      games: [{ id: 'g-1', name: 'old' } as Game],
      invites: [],
      unreadCounts: {},
    });

    setupQueryInvalidationBridge(client);

    useSocketEventsStore.setState({
      lastGameUpdate: {
        gameId: 'g-1',
        senderId: 'user-2',
        game: { id: 'g-1', name: 'fresh' } as Game,
      },
    });

    expect(getGamesFromAvailableCache(client.getQueryData(availKey))?.[0].name).toBe('fresh');
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['games'] });
  });

  it('revalidates only an index-only month containing an updated game', async () => {
    vi.useFakeTimers();
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const hitKey = queryKeys.games.available('month-hit');
    const missKey = queryKeys.games.available('month-miss');
    client.setQueryData<AvailableGamesPage>(hitKey, {
      games: [],
      meta: {
        ...EMPTY_AVAILABLE_META,
        dayIndex: [{ id: 'g-1', startTime: '2026-08-01T10:00:00.000Z' } as never],
      },
    });
    client.setQueryData<AvailableGamesPage>(missKey, {
      games: [],
      meta: {
        ...EMPTY_AVAILABLE_META,
        dayIndex: [{ id: 'other', startTime: '2026-08-01T11:00:00.000Z' } as never],
      },
    });

    setupQueryInvalidationBridge(client);
    useSocketEventsStore.setState({
      lastGameUpdate: {
        gameId: 'g-1',
        senderId: 'user-2',
        game: { id: 'g-1', name: 'fresh' } as Game,
      },
    });

    await vi.advanceTimersByTimeAsync(200);
    expect(invalidateSpy).toHaveBeenCalledWith(
      { queryKey: hitKey, exact: true },
      { cancelRefetch: false },
    );
    expect(invalidateSpy).not.toHaveBeenCalledWith(
      { queryKey: missKey, exact: true },
      expect.anything(),
    );
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['games'] });
  });

  it('skips invalidation when offline', () => {
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    useNetworkStore.getState().setOnline(false);
    setupQueryInvalidationBridge(client);

    useSocketEventsStore.setState({
      lastNewInvite: { id: 'inv-1' } as never,
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('invite deleted only scopes to My games', () => {
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const availKey = queryKeys.games.available('hash');
    const cached = page([{ id: 'g-1' } as Game]);
    client.setQueryData(availKey, cached);

    setupQueryInvalidationBridge(client);

    useSocketEventsStore.setState({
      lastInviteDeleted: { inviteId: 'inv-1', gameId: 'g-1' },
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.games.my('u1'),
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['games'] });
    expect(client.getQueryData(availKey)).toEqual(cached);
  });

  it('new invite upserts into My games cache then invalidates My only', () => {
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    client.setQueryData<MyGamesData>(queryKeys.games.my('u1'), {
      games: [],
      invites: [],
      unreadCounts: {},
    });

    setupQueryInvalidationBridge(client);

    useSocketEventsStore.setState({
      lastNewInvite: { id: 'inv-2', status: 'PENDING' } as never,
    });

    expect(client.getQueryData<MyGamesData>(queryKeys.games.my('u1'))?.invites.map((invite) => invite.id)).toEqual([
      'inv-2',
    ]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.games.my('u1'),
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['games'] });
  });

  it('malformed game update only revalidates Find queries that contain the game', async () => {
    vi.useFakeTimers();
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const hitKey = queryKeys.games.available('hit');
    const missKey = queryKeys.games.available('miss');
    client.setQueryData(hitKey, page([{ id: 'g-1' } as Game]));
    client.setQueryData(missKey, page([{ id: 'other' } as Game]));

    setupQueryInvalidationBridge(client);

    useSocketEventsStore.setState({
      lastGameUpdate: {
        gameId: 'g-1',
        senderId: 'user-2',
        game: null,
      } as never,
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.games.my('u1'),
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(invalidateSpy).toHaveBeenCalledWith(
      { queryKey: hitKey, exact: true },
      { cancelRefetch: false },
    );
    expect(invalidateSpy).not.toHaveBeenCalledWith(
      { queryKey: missKey, exact: true },
      expect.anything(),
    );
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['games'] });
  });
});
