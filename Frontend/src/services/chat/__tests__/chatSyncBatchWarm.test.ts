import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnreadObjectsApiPayload } from '../chatUnreadPayload';

const { enqueueChatSyncPullMock, postChatSyncBatchHeadMock } = vi.hoisted(() => ({
  enqueueChatSyncPullMock: vi.fn(),
  postChatSyncBatchHeadMock: vi.fn().mockResolvedValue({}),
}));

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
