import { describe, expect, it, vi } from 'vitest';
import { emptyUnreadTotals } from '@/services/chat/unreadSnapshot';

const getUnreadSnapshotObjectsMock = vi.fn();
const getUnreadObjectsMock = vi.fn();

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ token: 'test-token' }),
  },
}));

vi.mock('@/services/chat/syncAppIconBadgeFromStore', () => ({
  syncAppIconBadgeFromStore: vi.fn(),
}));

vi.mock('@/api/chat', () => ({
  chatApi: {
    postChatSyncBatchHead: vi.fn().mockResolvedValue({}),
    getUnreadSnapshotObjects: (...args: unknown[]) => getUnreadSnapshotObjectsMock(...args),
    getUnreadObjects: (...args: unknown[]) => getUnreadObjectsMock(...args),
  },
}));

vi.mock('@/store/playersStore', () => ({
  usePlayersStore: {
    getState: () => ({ chats: {} }),
  },
}));

vi.mock('@/services/chat/chatLocalDb', () => ({
  chatCursorKey: (t: string, id: string) => `${t}:${id}`,
  chatLocalDb: {
    threadIndex: { toArray: vi.fn().mockResolvedValue([]) },
    chatThreads: { get: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined) },
    messageContextHead: {
      get: vi.fn().mockResolvedValue(undefined),
      where: vi.fn().mockReturnValue({
        between: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
    },
    messages: { get: vi.fn().mockResolvedValue(undefined) },
  },
}));

vi.mock('@/services/chat/chatLocalApply', () => ({
  getLocalCursorSeq: vi.fn().mockResolvedValue(0),
}));

vi.mock('@/services/chat/chatSyncScheduler', () => ({
  enqueueChatSyncPull: vi.fn(),
  SYNC_PRIORITY_UNREAD: 1,
  SYNC_PRIORITY_WARM: 2,
}));

vi.mock('@/services/chat/chatThreadIndex', () => ({
  chatItemsFromUnreadGames: () => [],
  persistThreadIndexUpsert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/chat/chatTailHydrate', () => ({
  hydrateAllChatSyncTailsFromDexie: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/chat/chatHotThreadPrefetch', () => ({
  scheduleChatHotThreadPrefetchFromIdle: vi.fn(),
}));

describe('auth bootstrap unread-objects (#259)', () => {
  it('refreshAll uses objects snapshot and warm bootstrap skips duplicate unread fetch', async () => {
    vi.resetModules();
    const { useUnreadStore } = await import('@/store/unreadStore');
    useUnreadStore.getState().reset();
    getUnreadSnapshotObjectsMock.mockReset();
    getUnreadObjectsMock.mockReset();

    const snapshot = {
      data: {
        games: [{ game: { id: 'g1' }, unreadCount: 2 }],
        userChats: [],
        groupChannels: [],
        bugs: [],
        marketItems: [],
        byContext: { 'GAME:g1': 2 },
        totals: emptyUnreadTotals(),
      },
    };

    let resolveSnapshot: ((value: unknown) => void) | undefined;
    getUnreadSnapshotObjectsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSnapshot = resolve;
        }),
    );

    const refreshPromise = useUnreadStore.getState().refreshAll();

    const warm = await import('@/services/chat/chatSyncBatchWarm');
    warm.resetChatSyncWarmSession();
    const warmPromise = warm.ensureChatSyncWarmBootstrap();

    resolveSnapshot?.(snapshot);
    await refreshPromise;
    await warmPromise;

    expect(getUnreadSnapshotObjectsMock).toHaveBeenCalledTimes(1);
    expect(getUnreadObjectsMock).not.toHaveBeenCalled();
  });

  it('warm bootstrap starts refreshAll when auth refresh has not run yet', async () => {
    vi.resetModules();
    const { useUnreadStore } = await import('@/store/unreadStore');
    useUnreadStore.getState().reset();
    getUnreadSnapshotObjectsMock.mockReset();
    getUnreadObjectsMock.mockReset();

    getUnreadSnapshotObjectsMock.mockResolvedValue({
      data: {
        games: [],
        userChats: [],
        groupChannels: [],
        bugs: [],
        marketItems: [],
        byContext: {},
        totals: emptyUnreadTotals(),
      },
    });

    const warm = await import('@/services/chat/chatSyncBatchWarm');
    warm.resetChatSyncWarmSession();
    await warm.ensureChatSyncWarmBootstrap();

    expect(getUnreadSnapshotObjectsMock).toHaveBeenCalledTimes(1);
    expect(getUnreadObjectsMock).not.toHaveBeenCalled();
    expect(useUnreadStore.getState().fetchedAt).toBeGreaterThan(0);
  });

  it('warm bootstrap does not refetch when unread store is already warm', async () => {
    vi.resetModules();
    const { useUnreadStore } = await import('@/store/unreadStore');
    useUnreadStore.getState().reset();
    getUnreadSnapshotObjectsMock.mockReset();
    getUnreadObjectsMock.mockReset();

    getUnreadSnapshotObjectsMock.mockResolvedValue({
      data: {
        games: [],
        userChats: [],
        groupChannels: [],
        bugs: [],
        marketItems: [],
        byContext: {},
        totals: emptyUnreadTotals(),
      },
    });

    await useUnreadStore.getState().refreshAll();

    const warm = await import('@/services/chat/chatSyncBatchWarm');
    warm.resetChatSyncWarmSession();
    await warm.ensureChatSyncWarmBootstrap();

    expect(getUnreadSnapshotObjectsMock).toHaveBeenCalledTimes(1);
    expect(getUnreadObjectsMock).not.toHaveBeenCalled();
  });
});
