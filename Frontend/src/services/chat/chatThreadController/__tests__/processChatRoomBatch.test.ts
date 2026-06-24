import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import type { ChatRoomEvent } from '@/store/socketEventsStore';

const persistSocketInboundMessage = vi.fn<() => Promise<number>>();
const dispatchChatSyncStale = vi.fn();
const persistReactionSocketPayload = vi.fn(async () => {});
const markLocalMessageDeleted = vi.fn(async () => {});
const onSocketSyncSeq = vi.fn(async () => {});
const pullAndApplyChatSyncEventsDirect = vi.fn(async () => ({
  repairedStaleCursor: false,
  threadInvalidated: false,
  eventsApplied: 1,
}));
vi.mock('@/utils/chatSyncStaleEvents', () => ({
  BANDEJA_CHAT_SYNC_STALE: 'bandeja:chat-sync-stale',
  dispatchChatSyncStale: (...args: unknown[]) => dispatchChatSyncStale(...args),
}));

vi.mock('@/services/chat/chatLocalApply', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/chat/chatLocalApply')>();
  return {
    ...actual,
    persistSocketInboundMessage: (...args: unknown[]) => persistSocketInboundMessage(...args),
    applyThreadEvent: vi.fn(async () => 0),
    applyThreadL1Put: vi.fn(async () => 0),
    persistReactionSocketPayload: (...args: unknown[]) => persistReactionSocketPayload(...args),
    onSocketSyncSeq: (...args: unknown[]) => onSocketSyncSeq(...args),
    patchLocalReadReceipt: vi.fn(async () => {}),
    markLocalMessageDeleted: (...args: unknown[]) => markLocalMessageDeleted(...args),
    persistSocketTranscriptionAndSyncSeq: vi.fn(async () => {}),
    persistSocketPollVoteAndSyncSeq: vi.fn(async () => {}),
  };
});

vi.mock('@/services/chat/chatThreadIndex', () => ({
  patchThreadIndexClearUnread: vi.fn(async () => {}),
}));

vi.mock('@/services/socketService', () => ({
  socketService: {
    acknowledgeMessage: vi.fn(),
    confirmMessageReceipt: vi.fn(),
  },
}));

vi.mock('@/store/playersStore', () => ({
  usePlayersStore: {
    getState: () => ({ updateUnreadCount: vi.fn() }),
  },
}));

vi.mock('@/utils/chatScrollHelpers', () => ({
  scrollChatToBottomIfNearBottom: vi.fn(),
}));

vi.mock('@/services/chat/chatLocalApplyPull', () => ({
  pullAndApplyChatSyncEventsDirect: (...args: unknown[]) => pullAndApplyChatSyncEventsDirect(...args),
}));

import { resolveOwnMessageTicks } from '@/services/chat/messageTickState';
import { processChatRoomBatch, type ProcessChatRoomBatchCtx } from '../processChatRoomBatch';

function inboundMessage(id: string, senderId = 'other-user'): ChatMessage {
  return {
    id,
    chatContextType: 'USER',
    contextId: 'thread-1',
    senderId,
    content: `msg-${id}`,
    state: 'SENT',
    chatType: 'PUBLIC',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    reactions: [],
    readReceipts: [],
  };
}

function makeCtx(
  overrides: Partial<ProcessChatRoomBatchCtx> = {}
): ProcessChatRoomBatchCtx {
  const messagesRef = { current: [] as ChatMessageWithStatus[] };
  const setMessages: ProcessChatRoomBatchCtx['setMessages'] = (updater) => {
    const next = typeof updater === 'function' ? updater(messagesRef.current) : updater;
    messagesRef.current = next;
  };
  return {
    id: 'thread-1',
    contextType: 'USER',
    effectiveChatType: 'PUBLIC',
    userId: 'viewer-user',
    setMessages,
    messagesRef,
    onInboundMessage: vi.fn(),
    threadLiveConfig: {
      contextType: 'USER',
      contextId: 'thread-1',
      viewerUserId: 'viewer-user',
    },
    ...overrides,
  };
}

describe('processChatRoomBatch inbound message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistSocketInboundMessage.mockResolvedValue(1);
  });

  it('applies inbound message to thread state before Dexie persistence completes', async () => {
    let resolvePersist!: (value: number) => void;
    const persistPromise = new Promise<number>((resolve) => {
      resolvePersist = resolve;
    });
    persistSocketInboundMessage.mockReturnValue(persistPromise);

    const ctx = makeCtx();
    const batch: ChatRoomEvent[] = [
      {
        kind: 'message',
        data: {
          contextType: 'USER',
          contextId: 'thread-1',
          message: inboundMessage('m1'),
          messageId: 'm1',
          syncSeq: 42,
        },
      },
    ];

    processChatRoomBatch(batch, ctx);

    expect(ctx.messagesRef.current.some((m) => m.id === 'm1')).toBe(true);
    expect(persistSocketInboundMessage).toHaveBeenCalledWith(
      'USER',
      'thread-1',
      expect.objectContaining({ id: 'm1' }),
      42
    );

    resolvePersist(1);
    await persistPromise;
  });

  it('keeps inbound message visible when Dexie persistence fails', async () => {
    persistSocketInboundMessage.mockRejectedValue(new Error('dexie write failed'));

    const ctx = makeCtx();
    processChatRoomBatch(
      [
        {
          kind: 'message',
          data: {
            contextType: 'USER',
            contextId: 'thread-1',
            message: inboundMessage('m2'),
            messageId: 'm2',
            syncSeq: 43,
          },
        },
      ],
      ctx
    );

    expect(ctx.messagesRef.current.some((m) => m.id === 'm2')).toBe(true);

    await vi.waitFor(() => {
      expect(persistSocketInboundMessage).toHaveBeenCalledTimes(2);
    });
    await vi.waitFor(() => {
      expect(dispatchChatSyncStale).toHaveBeenCalledWith('USER', 'thread-1', 'cursorStale');
    });
  });

  it('calls onInboundMessage synchronously without waiting on persist', () => {
    const callOrder: string[] = [];
    persistSocketInboundMessage.mockImplementation(async () => {
      callOrder.push('persist');
      return 1;
    });

    const ctx = makeCtx({
      onInboundMessage: vi.fn(() => {
        callOrder.push('ui');
      }),
    });

    processChatRoomBatch(
      [
        {
          kind: 'message',
          data: {
            contextType: 'USER',
            contextId: 'thread-1',
            message: inboundMessage('m3'),
            messageId: 'm3',
          },
        },
      ],
      ctx
    );

    expect(callOrder[0]).toBe('ui');
    expect(callOrder).toContain('persist');
  });
});

describe('processChatRoomBatch allRead read receipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates all own message ticks on bulk mark-read without per-message ids', () => {
    const own = (id: string): ChatMessageWithStatus => ({
      ...inboundMessage(id, 'sender-a'),
      status: 'sent',
    });
    const ctx = makeCtx({ userId: 'sender-a' });
    ctx.threadLiveConfig = {
      contextType: 'USER',
      contextId: 'thread-1',
      viewerUserId: 'sender-a',
    };
    ctx.setMessages([own('m1'), own('m2'), { ...inboundMessage('m3', 'other-b'), status: 'sent' }]);

    processChatRoomBatch(
      [
        {
          kind: 'readReceipt',
          data: {
            contextType: 'USER',
            contextId: 'thread-1',
            readReceipt: {
              userId: 'reader-b',
              readAt: '2026-01-01T01:00:00.000Z',
              allRead: true,
            },
            syncSeq: 50,
          },
        },
      ],
      ctx
    );

    expect(resolveOwnMessageTicks(ctx.messagesRef.current[0]!)).toEqual({
      tickRead: true,
      tickDelivered: false,
    });
    expect(resolveOwnMessageTicks(ctx.messagesRef.current[1]!)).toEqual({
      tickRead: true,
      tickDelivered: false,
    });
    expect(pullAndApplyChatSyncEventsDirect).toHaveBeenCalledWith('USER', 'thread-1');
  });
});

describe('processChatRoomBatch with Thread Live Projection (Phase 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistSocketInboundMessage.mockResolvedValue(1);
  });

  it('routes inbound message through reducer when threadLiveConfig is provided', async () => {
    const ctx = makeCtx({
      threadLiveConfig: {
        contextType: 'USER',
        contextId: 'thread-1',
        viewerUserId: 'viewer-user',
      },
    });

    processChatRoomBatch(
      [
        {
          kind: 'message',
          data: {
            contextType: 'USER',
            contextId: 'thread-1',
            message: inboundMessage('m1', 'other-user'),
            messageId: 'm1',
            syncSeq: 42,
          },
        },
      ],
      ctx
    );

    expect(ctx.messagesRef.current.some((m) => m.id === 'm1')).toBe(true);
    expect(persistSocketInboundMessage).toHaveBeenCalled();
    expect(ctx.onInboundMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
  });

  it('routes readReceipt with allRead through reducer', async () => {
    const own = (id: string): ChatMessageWithStatus => ({
      ...inboundMessage(id, 'sender-a'),
      status: 'sent',
    });
    const ctx = makeCtx({
      userId: 'sender-a',
      threadLiveConfig: {
        contextType: 'USER',
        contextId: 'thread-1',
        viewerUserId: 'sender-a',
      },
    });
    ctx.setMessages([own('m1'), own('m2'), { ...inboundMessage('m3', 'other-b'), status: 'sent' }]);

    processChatRoomBatch(
      [
        {
          kind: 'readReceipt',
          data: {
            contextType: 'USER',
            contextId: 'thread-1',
            readReceipt: {
              userId: 'reader-b',
              readAt: '2026-01-01T01:00:00.000Z',
              allRead: true,
            },
            syncSeq: 50,
          },
        },
      ],
      ctx
    );

    // Reducer should have applied read receipts to own messages
    expect(resolveOwnMessageTicks(ctx.messagesRef.current[0]!)).toEqual({
      tickRead: true,
      tickDelivered: false,
    });
    expect(resolveOwnMessageTicks(ctx.messagesRef.current[1]!)).toEqual({
      tickRead: true,
      tickDelivered: false,
    });
    // Third message (not own) should not have read receipt
    expect(ctx.messagesRef.current[2]?.readReceipts).toHaveLength(0);

    expect(pullAndApplyChatSyncEventsDirect).toHaveBeenCalledWith('USER', 'thread-1');
  });

  it('routes single-message readReceipt through reducer', async () => {
    const ctx = makeCtx({
      threadLiveConfig: {
        contextType: 'USER',
        contextId: 'thread-1',
        viewerUserId: 'viewer-user',
      },
    });
    ctx.setMessages([{ ...inboundMessage('m1', 'viewer-user'), status: 'sent' }]);

    processChatRoomBatch(
      [
        {
          kind: 'readReceipt',
          data: {
            contextType: 'USER',
            contextId: 'thread-1',
            readReceipt: {
              userId: 'reader-b',
              readAt: '2026-01-01T01:00:00.000Z',
              messageId: 'm1',
            },
            syncSeq: 51,
          },
        },
      ],
      ctx
    );

    expect(ctx.messagesRef.current[0]?.readReceipts).toHaveLength(1);
    expect(ctx.messagesRef.current[0]?.readReceipts[0]?.userId).toBe('reader-b');
  });

  it('routes reaction and deleted socket events through the projection', () => {
    const ctx = makeCtx({
      threadLiveConfig: {
        contextType: 'USER',
        contextId: 'thread-1',
        viewerUserId: 'viewer-user',
      },
    });
    ctx.setMessages([{ ...inboundMessage('m1'), status: 'sent' }]);

    processChatRoomBatch(
      [
        {
          kind: 'reaction',
          data: {
            contextType: 'USER',
            contextId: 'thread-1',
            reaction: {
              messageId: 'm1',
              userId: 'user-1',
              emoji: '👍',
              createdAt: '2026-01-01T01:00:00.000Z',
            },
            syncSeq: 52,
          },
        },
        {
          kind: 'deleted',
          data: {
            contextType: 'USER',
            contextId: 'thread-1',
            messageId: 'm1',
            syncSeq: 53,
          },
        },
      ],
      ctx
    );

    expect(ctx.messagesRef.current).toHaveLength(0);
    expect(persistReactionSocketPayload).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'm1', userId: 'user-1', emoji: '👍' })
    );
    expect(markLocalMessageDeleted).toHaveBeenCalledWith('m1', expect.any(String));
    expect(onSocketSyncSeq).toHaveBeenCalledWith('USER', 'thread-1', 52);
    expect(onSocketSyncSeq).toHaveBeenCalledWith('USER', 'thread-1', 53);
  });
});
