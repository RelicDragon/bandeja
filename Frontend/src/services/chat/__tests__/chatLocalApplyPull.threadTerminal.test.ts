import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSyncEventType } from '@bandeja/chat-contract';

const applyThreadTerminalMock = vi.fn();
const fetchPackMock = vi.fn();
const applyPatchesMock = vi.fn();
const messagesBulkDeleteMock = vi.fn();

vi.mock('../chatThreadLifecycle', () => ({
  applyThreadTerminal: (...args: unknown[]) => applyThreadTerminalMock(...args),
}));

vi.mock('@/services/chat/chatSyncFetchWorkerClient', () => ({
  fetchChatSyncEventsPackOffMainThread: (...args: unknown[]) => fetchPackMock(...args),
}));

vi.mock('@/services/chat/chatHttpRetry', () => ({
  withChatSyncRetry: (_label: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../chatSyncEventsToPatches', () => ({
  chatSyncEventsToPatches: vi.fn(() => []),
}));

vi.mock('../chatSyncApplyPatches', () => ({
  applyChatSyncPatchesInSlice: (...args: unknown[]) => applyPatchesMock(...args),
}));

vi.mock('../chatLocalApplyBulk', () => ({
  withChatLocalBulkApply: (fn: () => Promise<void>) => fn(),
}));

vi.mock('../chatLocalCoop', () => ({
  broadcastChatPullHint: vi.fn(),
  ensureChatLocalCoopListener: vi.fn(),
}));

vi.mock('../chatLocalDb', () => ({
  chatCursorKey: (ct: string, id: string) => `${ct}:${id}`,
  chatLocalDb: {
    chatSyncCursor: {
      get: vi.fn(async (key: string) => ({ key, lastAppliedSeq: 0, updatedAt: 0 })),
      put: vi.fn(async () => {}),
    },
    messages: {
      get: vi.fn(),
      bulkDelete: (...args: unknown[]) => messagesBulkDeleteMock(...args),
      where: vi.fn(() => ({ equals: () => ({ primaryKeys: async () => [] }) })),
    },
    messageSearchTokens: {},
    transaction: vi.fn(async (_mode: string, _tables: unknown, fn: () => Promise<unknown>) => fn()),
  },
}));

vi.mock('../chatLocalApplyCursor', () => ({
  BATCH_HEAD_CACHE_MS: 30_000,
  getLocalCursorSeq: vi.fn(async () => 0),
  BATCH_HEAD_CACHE_MS: 30_000,
  reconcileCursorWithServerHead: vi.fn(async () => {}),
}));

vi.mock('../chatLocalApplySyncTimers', () => ({
  clearPendingSocketSeqReconcileTimer: vi.fn(),
}));

vi.mock('../chatLocalApplyWrite', () => ({
  persistChatMessagesFromApiDirect: vi.fn(async () => {}),
}));

vi.mock('../chatLocalApplyPersistMessage', () => ({
  persistCreatedEventMediaTombstones: vi.fn(async () => []),
}));

vi.mock('@/services/chat/chatMediaThumbPrefetch', () => ({
  scheduleChatMediaThumbPrefetchForMessage: vi.fn(),
}));

const notifyInboundMessageSeenMock = vi.fn();

vi.mock('@/services/chat/unreadInboundMessage', () => ({
  notifyInboundMessageSeen: (...args: unknown[]) => notifyInboundMessageSeenMock(...args),
}));

vi.mock('../chatSyncRowUtils', () => ({
  rowFromMessage: vi.fn(),
}));

vi.mock('../chatThreadIndex', () => ({
  patchThreadIndexAfterMessageDeleted: vi.fn(async () => {}),
  patchThreadIndexFromMessage: vi.fn(async () => {}),
}));

vi.mock('../messageContextHead', () => ({
  bumpMessageContextHead: vi.fn(async () => {}),
  refreshMessageContextHeadAfterDelete: vi.fn(async () => {}),
}));

vi.mock('@/utils/chatSyncStaleEvents', () => ({
  dispatchChatSyncStale: vi.fn(),
}));

vi.mock('@/services/chat/chatSyncMetrics', () => ({
  recordChatSyncStaleDispatch: vi.fn(),
}));

import { pullEventsLoop } from '../chatLocalApplyPull';
import { chatLocalDb } from '../chatLocalDb';
import { persistCreatedEventMediaTombstones } from '../chatLocalApplyPersistMessage';

describe('pullEventsLoop thread terminal events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyPatchesMock.mockResolvedValue({
      putMessagesForMedia: [],
      patchMessageFallbacks: [],
      persistedMessages: [],
    });
  });

  it('THREAD_ARCHIVED applies archive terminal without purging messages', async () => {
    fetchPackMock.mockResolvedValueOnce({
      cursorStale: false,
      events: [
        {
          seq: 12,
          eventType: ChatSyncEventType.THREAD_ARCHIVED,
          payload: { reason: 'game_cancelled', archivedAt: '2026-07-03T12:00:00.000Z' },
        },
      ],
      hasMore: false,
    });

    const result = await pullEventsLoop('GAME', 'g-arch');

    expect(applyThreadTerminalMock).toHaveBeenCalledWith('archived', 'GAME', 'g-arch', {
      syncSeq: 12,
      archivedAt: Date.parse('2026-07-03T12:00:00.000Z'),
    });
    expect(result.threadArchived).toBe(true);
    expect(result.threadInvalidated).toBe(false);
    expect(messagesBulkDeleteMock).not.toHaveBeenCalled();
  });

  it('MESSAGE_CREATED during full replay (cursor 0) does not bump optimistic unread', async () => {
    fetchPackMock.mockResolvedValueOnce({
      cursorStale: false,
      events: [
        {
          seq: 3,
          eventType: ChatSyncEventType.MESSAGE_CREATED,
          payload: {
            message: {
              id: 'm-hist',
              senderId: 'other-user',
              chatContextType: 'USER',
              contextId: 'u1',
            },
          },
        },
      ],
      hasMore: false,
    });

    await pullEventsLoop('USER', 'u1');

    expect(notifyInboundMessageSeenMock).not.toHaveBeenCalled();
  });

  it('MESSAGE_CREATED during incremental pull (cursor > 0) bumps optimistic unread', async () => {
    const { getLocalCursorSeq } = await import('../chatLocalApplyCursor');
    vi.mocked(getLocalCursorSeq).mockResolvedValueOnce(5);

    applyPatchesMock.mockResolvedValue({
      putMessagesForMedia: [],
      patchMessageFallbacks: [],
      persistedMessages: [
        {
          id: 'm-new',
          senderId: 'other-user',
          chatContextType: 'USER',
          contextId: 'u1',
        },
      ],
    });

    fetchPackMock.mockResolvedValueOnce({
      cursorStale: false,
      events: [
        {
          seq: 6,
          eventType: ChatSyncEventType.MESSAGE_CREATED,
          payload: {
            message: {
              id: 'm-new',
              senderId: 'other-user',
              chatContextType: 'USER',
              contextId: 'u1',
            },
          },
        },
      ],
      hasMore: false,
    });

    await pullEventsLoop('USER', 'u1');

    expect(notifyInboundMessageSeenMock).toHaveBeenCalledWith({
      contextType: 'USER',
      contextId: 'u1',
      messageId: 'm-new',
      senderId: 'other-user',
    });
  });

  it('THREAD_LOCAL_INVALIDATE still purges via invalidate terminal', async () => {
    fetchPackMock.mockResolvedValueOnce({
      cursorStale: false,
      events: [{ seq: 5, eventType: ChatSyncEventType.THREAD_LOCAL_INVALIDATE, payload: {} }],
      hasMore: false,
    });

    const result = await pullEventsLoop('GAME', 'g-inv');

    expect(applyThreadTerminalMock).toHaveBeenCalledWith('invalidate', 'GAME', 'g-inv');
    expect(result.threadInvalidated).toBe(true);
    expect(result.threadArchived).toBe(false);
  });

  it('does not advance cursor past unpersisted MESSAGE_CREATED image', async () => {
    fetchPackMock.mockResolvedValueOnce({
      cursorStale: false,
      events: [
        {
          seq: 10,
          eventType: ChatSyncEventType.MESSAGE_CREATED,
          payload: {
            message: {
              id: 'photo-1',
              messageType: 'IMAGE',
              mediaUrls: ['https://cdn.example/a.jpg'],
              chatContextType: 'USER',
              contextId: 'u1',
              senderId: 'other-user',
            },
          },
        },
      ],
      hasMore: false,
    });

    const result = await pullEventsLoop('USER', 'u1');

    expect(result.blockedOnUnapplied).toBe(true);
    expect(chatLocalDb.chatSyncCursor.put).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'USER:u1', lastAppliedSeq: 0 })
    );
    expect(chatLocalDb.chatSyncCursor.put).not.toHaveBeenCalledWith(
      expect.objectContaining({ lastAppliedSeq: 10 })
    );
  });

  it('advances cursor when MESSAGE_CREATED image is persisted', async () => {
    applyPatchesMock.mockResolvedValue({
      putMessagesForMedia: [],
      patchMessageFallbacks: [],
      persistedMessages: [
        {
          id: 'photo-1',
          messageType: 'IMAGE',
          mediaUrls: ['https://cdn.example/a.jpg'],
          thumbnailUrls: ['https://cdn.example/a.jpg'],
        },
      ],
    });
    fetchPackMock.mockResolvedValueOnce({
      cursorStale: false,
      events: [
        {
          seq: 10,
          eventType: ChatSyncEventType.MESSAGE_CREATED,
          payload: {
            message: {
              id: 'photo-1',
              messageType: 'IMAGE',
              mediaUrls: ['https://cdn.example/a.jpg'],
              thumbnailUrls: ['https://cdn.example/a.jpg'],
              chatContextType: 'USER',
              contextId: 'u1',
              senderId: 'other-user',
            },
          },
        },
      ],
      hasMore: false,
    });

    const result = await pullEventsLoop('USER', 'u1');

    expect(result.blockedOnUnapplied).toBe(false);
    expect(chatLocalDb.chatSyncCursor.put).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'USER:u1', lastAppliedSeq: 10 })
    );
  });

  it('tombstones created media when slice persist throws and advances cursor past the tombstone', async () => {
    applyPatchesMock.mockRejectedValue(new Error('dexie write failed'));
    vi.mocked(persistCreatedEventMediaTombstones).mockResolvedValueOnce([{ id: 'photo-1' }]);
    fetchPackMock.mockResolvedValueOnce({
      cursorStale: false,
      events: [
        {
          seq: 10,
          eventType: ChatSyncEventType.MESSAGE_CREATED,
          payload: {
            message: {
              id: 'photo-1',
              messageType: 'IMAGE',
              mediaUrls: ['https://cdn.example/a.jpg'],
              chatContextType: 'USER',
              contextId: 'u1',
              senderId: 'other-user',
            },
          },
        },
      ],
      hasMore: false,
    });

    const result = await pullEventsLoop('USER', 'u1');

    expect(result.blockedOnUnapplied).toBe(false);
    expect(persistCreatedEventMediaTombstones).toHaveBeenCalled();
    expect(chatLocalDb.chatSyncCursor.put).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'USER:u1', lastAppliedSeq: 10 })
    );
  });

  it('does not advance cursor when slice persist and tombstone both fail', async () => {
    applyPatchesMock.mockRejectedValue(new Error('dexie write failed'));
    vi.mocked(persistCreatedEventMediaTombstones).mockRejectedValueOnce(new Error('tombstone failed'));
    fetchPackMock.mockResolvedValueOnce({
      cursorStale: false,
      events: [
        {
          seq: 10,
          eventType: ChatSyncEventType.MESSAGE_CREATED,
          payload: {
            message: {
              id: 'photo-1',
              messageType: 'IMAGE',
              mediaUrls: ['https://cdn.example/a.jpg'],
              chatContextType: 'USER',
              contextId: 'u1',
              senderId: 'other-user',
            },
          },
        },
      ],
      hasMore: false,
    });

    const result = await pullEventsLoop('USER', 'u1');

    expect(result.blockedOnUnapplied).toBe(true);
    expect(chatLocalDb.chatSyncCursor.put).not.toHaveBeenCalledWith(
      expect.objectContaining({ lastAppliedSeq: 10 })
    );
  });

  it('does not skip MESSAGE_DELETED when a failed slice only tombstones an image', async () => {
    applyPatchesMock.mockRejectedValue(new Error('dexie write failed'));
    vi.mocked(persistCreatedEventMediaTombstones).mockResolvedValueOnce([{ id: 'photo-1' }]);
    fetchPackMock.mockResolvedValueOnce({
      cursorStale: false,
      events: [
        {
          seq: 10,
          eventType: ChatSyncEventType.MESSAGE_CREATED,
          payload: {
            message: {
              id: 'photo-1',
              messageType: 'IMAGE',
              mediaUrls: ['https://cdn.example/a.jpg'],
              chatContextType: 'USER',
              contextId: 'u1',
              senderId: 'other-user',
            },
          },
        },
        {
          seq: 11,
          eventType: ChatSyncEventType.MESSAGE_DELETED,
          payload: { messageId: 'm-del' },
        },
      ],
      hasMore: false,
    });

    const result = await pullEventsLoop('USER', 'u1');

    expect(result.blockedOnUnapplied).toBe(true);
    expect(chatLocalDb.chatSyncCursor.put).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'USER:u1', lastAppliedSeq: 10 })
    );
    expect(chatLocalDb.chatSyncCursor.put).not.toHaveBeenCalledWith(
      expect.objectContaining({ lastAppliedSeq: 11 })
    );
  });

  it('stops paging when hasMore but the local cursor cannot advance', async () => {
    fetchPackMock.mockResolvedValue({
      cursorStale: false,
      events: [
        {
          seq: 10,
          eventType: ChatSyncEventType.MESSAGE_CREATED,
          payload: {
            message: {
              id: 'photo-1',
              messageType: 'IMAGE',
              mediaUrls: ['https://cdn.example/a.jpg'],
              chatContextType: 'USER',
              contextId: 'u1',
              senderId: 'other-user',
            },
          },
        },
      ],
      hasMore: true,
    });

    const result = await pullEventsLoop('USER', 'u1');

    expect(result.blockedOnUnapplied).toBe(true);
    expect(fetchPackMock).toHaveBeenCalledTimes(1);
  });
});
