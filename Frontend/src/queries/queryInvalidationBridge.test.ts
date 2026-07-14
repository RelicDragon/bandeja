import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('new invite only scopes to My games', () => {
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    setupQueryInvalidationBridge(client);

    useSocketEventsStore.setState({
      lastNewInvite: { id: 'inv-2' } as never,
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.games.my('u1'),
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['games'] });
  });

  it('malformed game update only invalidates Find queries that contain the game', () => {
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
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        predicate: expect.any(Function),
      }),
    );
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['games'] });

    const predicateCall = invalidateSpy.mock.calls.find(
      (call) => typeof (call[0] as { predicate?: unknown })?.predicate === 'function',
    );
    const predicate = (predicateCall?.[0] as {
      predicate: (q: { queryKey: unknown; state: { data: unknown } }) => boolean;
    }).predicate;
    expect(
      predicate({
        queryKey: hitKey,
        state: { data: client.getQueryData(hitKey) },
      }),
    ).toBe(true);
    expect(
      predicate({
        queryKey: missKey,
        state: { data: client.getQueryData(missKey) },
      }),
    ).toBe(false);
  });
});
