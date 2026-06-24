import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import type { ChatRoomEvent } from '@/store/socketEventsStore';

const persistSocketInboundMessage = vi.fn<() => Promise<number>>();
const dispatchChatSyncStale = vi.fn();
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
    persistReactionSocketPayload: vi.fn(async () => {}),
    onSocketSyncSeq: vi.fn(async () => {}),
    patchLocalReadReceipt: vi.fn(async () => {}),
    markLocalMessageDeleted: vi.fn(async () => {}),
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
    chatContainerRef: { current: null },
    setMessages,
    messagesRef,
    handleNewMessage: vi.fn((message: ChatMessage) => {
      setMessages((prev) => [...prev, { ...message, status: 'sent' as const }]);
    }),
    handleMessageReaction: vi.fn(),
    handleReadReceipt: vi.fn(),
    handleMessageDeleted: vi.fn(),
    fetchPinnedMessages: vi.fn(),
    handleMessageUpdated: vi.fn(),
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

  it('calls handleNewMessage synchronously without waiting on persist', () => {
    const callOrder: string[] = [];
    persistSocketInboundMessage.mockImplementation(async () => {
      callOrder.push('persist');
      return 1;
    });

    const ctx = makeCtx({
      handleNewMessage: vi.fn(() => {
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
