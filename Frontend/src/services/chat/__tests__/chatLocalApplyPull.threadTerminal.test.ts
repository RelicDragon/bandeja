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
  getLocalCursorSeq: vi.fn(async () => 0),
}));

vi.mock('../chatLocalApplySyncTimers', () => ({
  clearPendingSocketSeqReconcileTimer: vi.fn(),
}));

vi.mock('../chatLocalApplyWrite', () => ({
  persistChatMessagesFromApiDirect: vi.fn(async () => {}),
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

describe('pullEventsLoop thread terminal events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyPatchesMock.mockResolvedValue({ putMessagesForMedia: [], patchMessageFallbacks: [] });
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
});
