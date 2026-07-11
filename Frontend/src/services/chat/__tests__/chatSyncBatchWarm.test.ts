import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnreadObjectsApiPayload } from '../chatUnreadPayload';

const { enqueueChatSyncPullMock, postChatSyncBatchHeadMock } = vi.hoisted(() => ({
  enqueueChatSyncPullMock: vi.fn(),
  postChatSyncBatchHeadMock: vi.fn().mockResolvedValue({}),
}));

const hydrateGate = vi.hoisted(() => {
  let release: (() => void) | undefined;
  let pending: Promise<void> | null = null;
  return {
    block() {
      pending = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    release() {
      release?.();
      release = undefined;
      pending = null;
    },
    wait() {
      return pending ?? Promise.resolve();
    },
    reset() {
      release = undefined;
      pending = null;
    },
  };
});

vi.mock('@/api/chat', () => ({
  chatApi: {
    postChatSyncBatchHead: postChatSyncBatchHeadMock,
    getUnreadObjects: vi.fn().mockResolvedValue({ data: null }),
  },
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ token: 'test-token' }),
  },
}));

vi.mock('@/store/playersStore', () => ({
  usePlayersStore: {
    getState: () => ({ chats: {} }),
  },
}));

vi.mock('../chatLocalDb', () => ({
  chatCursorKey: (t: string, id: string) => `${t}:${id}`,
  chatLocalDb: {
    threadIndex: {
      toArray: vi.fn().mockResolvedValue([{ contextType: 'GAME', contextId: 'game-1' }]),
    },
    chatThreads: {
      get: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
    messageContextHead: {
      get: vi.fn().mockResolvedValue(undefined),
      where: vi.fn().mockReturnValue({
        between: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
    },
    messages: { get: vi.fn().mockResolvedValue(undefined) },
  },
}));

vi.mock('../chatLocalApply', () => ({
  getLocalCursorSeq: vi.fn().mockResolvedValue(0),
}));

vi.mock('../chatSyncScheduler', () => ({
  enqueueChatSyncPull: (...args: unknown[]) => enqueueChatSyncPullMock(...args),
  SYNC_PRIORITY_UNREAD: 1,
  SYNC_PRIORITY_WARM: 2,
}));

const minimalPayload: UnreadObjectsApiPayload = {
  games: [],
  bugs: [],
  userChats: [],
  groupChannels: [],
  marketItems: [],
};

describe('chatSyncBatchWarm dedupe', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    enqueueChatSyncPullMock.mockClear();
    postChatSyncBatchHeadMock.mockClear();
    postChatSyncBatchHeadMock.mockResolvedValue({ 'GAME:game-1': 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('implicit warmChatSyncHeads is deduped within cooldown window', async () => {
    const warm = await import('../chatSyncBatchWarm');
    warm.resetChatSyncWarmSession();
    await warm.warmChatSyncHeads();
    postChatSyncBatchHeadMock.mockClear();

    await warm.warmChatSyncHeads();

    expect(postChatSyncBatchHeadMock).not.toHaveBeenCalled();
  });

  it('explicit warmChatSyncHeads still runs batch-head during implicit cooldown', async () => {
    const warm = await import('../chatSyncBatchWarm');
    warm.resetChatSyncWarmSession();
    await warm.warmChatSyncHeads();
    postChatSyncBatchHeadMock.mockClear();

    await warm.warmChatSyncHeads([{ contextType: 'USER', contextId: 'user-2' }]);

    expect(postChatSyncBatchHeadMock).toHaveBeenCalledTimes(1);
  });

  it('scheduleWarmFromUnreadApiPayload skips batch-head during implicit warm cooldown', async () => {
    const warm = await import('../chatSyncBatchWarm');
    warm.resetChatSyncWarmSession();
    await warm.warmChatSyncHeads();
    postChatSyncBatchHeadMock.mockClear();

    warm.scheduleWarmFromUnreadApiPayload(minimalPayload);
    await vi.advanceTimersByTimeAsync(500);

    expect(postChatSyncBatchHeadMock).not.toHaveBeenCalled();
  });

  it('passes batch-head server max seq to scheduled event pulls', async () => {
    postChatSyncBatchHeadMock.mockResolvedValue({ 'GAME:game-1': 12 });
    const warm = await import('../chatSyncBatchWarm');
    warm.resetChatSyncWarmSession();

    await warm.warmChatSyncHeads();

    expect(enqueueChatSyncPullMock).toHaveBeenCalledWith('GAME', 'game-1', 2, {
      expectedServerMaxSeq: 12,
    });
  });
});

describe('chatSyncBatchWarm tiered bootstrap (#261)', () => {
  const threadIndexToArrayMock = vi.fn();
  const chatThreadsToArrayMock = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    enqueueChatSyncPullMock.mockClear();
    postChatSyncBatchHeadMock.mockClear();
    threadIndexToArrayMock.mockReset();
    chatThreadsToArrayMock.mockReset();
    hydrateGate.reset();
    threadIndexToArrayMock.mockResolvedValue([
      { contextType: 'GAME', contextId: 'game-unread' },
      { contextType: 'GAME', contextId: 'game-cold-1' },
      { contextType: 'GAME', contextId: 'game-cold-2' },
      { contextType: 'USER', contextId: 'user-hot' },
    ]);
    chatThreadsToArrayMock.mockResolvedValue([
      { key: 'USER:user-hot', lastOpenedAt: 9_000, openCount: 3 },
    ]);
    postChatSyncBatchHeadMock.mockImplementation(async (chunk: Array<{ contextType: string; contextId: string }>) => {
      const heads: Record<string, number> = {};
      for (const it of chunk) {
        heads[`${it.contextType}:${it.contextId}`] = 5;
      }
      return heads;
    });

    vi.doMock('../chatLocalDb', () => ({
      chatCursorKey: (t: string, id: string) => `${t}:${id}`,
      chatLocalDb: {
        threadIndex: { toArray: threadIndexToArrayMock },
        chatThreads: {
          get: vi.fn().mockResolvedValue(undefined),
          put: vi.fn().mockResolvedValue(undefined),
          toArray: chatThreadsToArrayMock,
        },
        messageContextHead: {
          get: vi.fn().mockResolvedValue(undefined),
          where: vi.fn().mockReturnValue({
            between: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
          }),
        },
        messages: { get: vi.fn().mockResolvedValue(undefined) },
      },
    }));
    vi.doMock('@/store/unreadStore', () => ({
      isUnreadStoreWarm: () => true,
      useUnreadStore: {
        getState: () => ({
          refreshInFlight: null,
          refreshAll: vi.fn().mockResolvedValue(undefined),
          baseByContext: { 'GAME:game-unread': 2 },
        }),
      },
    }));
    vi.doMock('@/services/chat/chatTailHydrate', () => ({
      hydrateAllChatSyncTailsFromDexie: () => hydrateGate.wait(),
    }));
    vi.doMock('../chatHotThreadPrefetch', () => ({
      scheduleChatHotThreadPrefetchFromIdle: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('../chatLocalDb');
    vi.doUnmock('@/store/unreadStore');
    vi.doUnmock('@/services/chat/chatTailHydrate');
    vi.doUnmock('../chatHotThreadPrefetch');
  });

  it('bootstrap immediate event pulls only unread and hot threads', async () => {
    const warm = await import('../chatSyncBatchWarm');
    warm.resetChatSyncWarmSession();
    await warm.ensureChatSyncWarmBootstrap();

    const immediateKeys = enqueueChatSyncPullMock.mock.calls.map(
      (call) => `${call[0]}:${call[1]}`
    );
    expect(immediateKeys).toContain('GAME:game-unread');
    expect(immediateKeys).toContain('USER:user-hot');
    expect(immediateKeys).not.toContain('GAME:game-cold-1');
    expect(immediateKeys).not.toContain('GAME:game-cold-2');
    expect(immediateKeys).toHaveLength(2);
  });

  it('full pull policy still immediate-pulls all stale threads up to cap', async () => {
    const warm = await import('../chatSyncBatchWarm');
    warm.resetChatSyncWarmSession();
    await warm.warmChatSyncHeads(undefined, { pullPolicy: 'full', skipCooldown: true });

    expect(enqueueChatSyncPullMock).toHaveBeenCalledTimes(4);
  });

  it('falls back to thread index activity when open history is absent', async () => {
    threadIndexToArrayMock.mockResolvedValue([
      { contextType: 'GAME', contextId: 'game-unread', sortAt: 8_000 },
      { contextType: 'GAME', contextId: 'game-cold-1', sortAt: 9_000 },
      { contextType: 'GAME', contextId: 'game-cold-2', sortAt: 1_000 },
      { contextType: 'USER', contextId: 'user-warm', sortAt: 7_000 },
    ]);
    chatThreadsToArrayMock.mockResolvedValue([]);

    const warm = await import('../chatSyncBatchWarm');
    warm.resetChatSyncWarmSession();
    await warm.ensureChatSyncWarmBootstrap();

    const immediateKeys = enqueueChatSyncPullMock.mock.calls.map(
      (call) => `${call[0]}:${call[1]}`
    );
    expect(immediateKeys).toContain('GAME:game-unread');
    expect(immediateKeys).toContain('GAME:game-cold-1');
    expect(immediateKeys).toContain('USER:user-warm');
    expect(immediateKeys).toHaveLength(4);
  });

  it('chats tab intent during bootstrap chains a full warm after tiered bootstrap', async () => {
    hydrateGate.block();
    const warm = await import('../chatSyncBatchWarm');
    warm.resetChatSyncWarmSession();
    const bootstrapPromise = warm.ensureChatSyncWarmBootstrap();
    await Promise.resolve();
    warm.warmChatSyncHeadsOnChatsTabIntent();
    hydrateGate.release();
    await bootstrapPromise;
    await warm.awaitChatSyncWarmIdle();

    expect(enqueueChatSyncPullMock.mock.calls.length).toBeGreaterThanOrEqual(4);
    const keys = enqueueChatSyncPullMock.mock.calls.map((call) => `${call[0]}:${call[1]}`);
    expect(keys).toContain('GAME:game-cold-1');
    expect(keys).toContain('GAME:game-cold-2');
  });

  it('deferred bootstrap overflow drains after bootstrap delay', async () => {
    const warm = await import('../chatSyncBatchWarm');
    warm.resetChatSyncWarmSession();
    await warm.ensureChatSyncWarmBootstrap();
    enqueueChatSyncPullMock.mockClear();

    await vi.advanceTimersByTimeAsync(4_000);

    const drainedKeys = enqueueChatSyncPullMock.mock.calls.map((call) => `${call[0]}:${call[1]}`);
    expect(drainedKeys).toContain('GAME:game-cold-1');
    expect(drainedKeys).toContain('GAME:game-cold-2');
  });
});
