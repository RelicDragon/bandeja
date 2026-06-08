import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
vi.mock('@/services/socketService', () => ({
  socketService: { on: vi.fn(), off: vi.fn() },
}));

import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useNetworkStore } from '@/utils/networkStatus';
import {
  setupQueryInvalidationBridge,
  teardownQueryInvalidationBridge,
} from './queryInvalidationBridge';

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

describe('queryInvalidationBridge', () => {
  beforeEach(() => {
    teardownQueryInvalidationBridge();
    useNetworkStore.getState().setOnline(true);
    useSocketEventsStore.setState({
      lastGameUpdate: null,
      lastNewInvite: null,
      lastInviteDeleted: null,
    });
  });

  it('invalidates games queries on game update when online', async () => {
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    setupQueryInvalidationBridge(client);

    useSocketEventsStore.setState({
      lastGameUpdate: {
        gameId: 'g-1',
        senderId: 'user-2',
        game: { id: 'g-1' } as never,
      },
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['games'] });
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

  it('invalidates on invite deleted when online', () => {
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    setupQueryInvalidationBridge(client);

    useSocketEventsStore.setState({
      lastInviteDeleted: { inviteId: 'inv-1', gameId: 'g-1' },
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['games'] });
  });
});
