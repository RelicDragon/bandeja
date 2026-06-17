import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import type { QueuedMessage } from '@/services/chatMessageQueueStorage';
import { serverMessageMatchesQueuedItem } from '@/services/applyQueuedMessagesToState';
import { mergeChatMessagesAscending } from '@/utils/chatMessageSort';
import {
  findPendingOptimisticIndex,
  reconcileOptimisticMessages,
  stripPendingOptimisticsMatchedByServer,
} from './optimisticReconcile';

const USER = 'user-1';

function optimistic(
  id: string,
  overrides: Partial<ChatMessageWithStatus> = {}
): ChatMessageWithStatus {
  return {
    id,
    chatContextType: 'GAME',
    contextId: 'g1',
    senderId: USER,
    content: 'hello',
    mediaUrls: [],
    thumbnailUrls: [],
    mentionIds: [],
    state: 'SENT',
    chatType: 'PUBLIC',
    createdAt: '2026-01-01T00:00:01.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
    sender: null,
    reactions: [],
    readReceipts: [],
    _status: 'SENDING',
    _optimisticId: id,
    _clientMutationId: 'cid-default',
    ...overrides,
  };
}

function server(id: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    chatContextType: 'GAME',
    contextId: 'g1',
    senderId: USER,
    content: 'hello',
    mediaUrls: [],
    thumbnailUrls: [],
    mentionIds: [],
    state: 'SENT',
    chatType: 'PUBLIC',
    createdAt: '2026-01-01T00:00:02.000Z',
    updatedAt: '2026-01-01T00:00:02.000Z',
    sender: null,
    reactions: [],
    readReceipts: [],
    clientMutationId: 'cid-default',
    ...overrides,
  };
}

describe('reconcileOptimisticMessages', () => {
  it('send-ack: replaces pending row by optimisticIdHint', () => {
    const result = reconcileOptimisticMessages({
      messages: [optimistic('opt-1', { _clientMutationId: 'cid-a' })],
      incoming: [server('srv-1', { clientMutationId: 'cid-a' })],
      userId: USER,
      optimisticIdHint: 'opt-1',
    });
    expect(result.actions).toEqual(['replace']);
    expect(result.replacedOptimisticIds).toEqual(['opt-1']);
    expect(result.messages[0]!.id).toBe('srv-1');
    expect(result.messages[0]!._status).toBeUndefined();
  });

  it('socket inbound: replaces own pending row by clientMutationId', () => {
    const result = reconcileOptimisticMessages({
      messages: [optimistic('opt-1', { _clientMutationId: 'cid-b' })],
      incoming: [server('srv-2', { clientMutationId: 'cid-b' })],
      userId: USER,
    });
    expect(result.actions).toEqual(['replace']);
    expect(result.messages[0]!.id).toBe('srv-2');
  });

  it('open-rehydrate replay: batch replaces pending matched by clientMutationId', () => {
    const result = reconcileOptimisticMessages({
      messages: [
        server('srv-old', { content: 'earlier', clientMutationId: undefined }),
        optimistic('opt-1', { _clientMutationId: 'cid-r' }),
      ],
      incoming: [server('srv-r', { clientMutationId: 'cid-r' })],
      userId: USER,
    });
    expect(result.actions).toEqual(['replace']);
    expect(result.messages.map((m) => m.id)).toEqual(['srv-old', 'srv-r']);
  });

  it('duplicate server id: removes pending when server row already promoted', () => {
    const result = reconcileOptimisticMessages({
      messages: [
        server('srv-1', { clientMutationId: 'cid-d' }) as ChatMessageWithStatus,
        optimistic('opt-1', { _clientMutationId: 'cid-d' }),
      ],
      incoming: [server('srv-1', { clientMutationId: 'cid-d' })],
      userId: USER,
    });
    expect(result.actions).toEqual(['remove-pending']);
    expect(result.removedOptimisticIds).toEqual(['opt-1']);
    expect(result.messages).toHaveLength(1);
  });

  it('send-ack after socket append: drops pending by optimisticIdHint when server row exists', () => {
    const result = reconcileOptimisticMessages({
      messages: [
        server('srv-1') as ChatMessageWithStatus,
        optimistic('opt-1', { _clientMutationId: 'cid-a' }),
      ],
      incoming: [server('srv-1', { clientMutationId: 'cid-a' })],
      userId: USER,
      optimisticIdHint: 'opt-1',
    });
    expect(result.actions).toEqual(['remove-pending']);
    expect(result.removedOptimisticIds).toEqual(['opt-1']);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.id).toBe('srv-1');
  });

  it('socket inbound after append: drops pending by fingerprint when server row exists', () => {
    const result = reconcileOptimisticMessages({
      messages: [
        server('srv-1', { content: 'hi', clientMutationId: undefined }) as ChatMessageWithStatus,
        optimistic('opt-1', { _clientMutationId: undefined, content: 'hi' }),
      ],
      incoming: [server('srv-1', { content: 'hi', clientMutationId: undefined })],
      userId: USER,
    });
    expect(result.actions).toEqual(['remove-pending']);
    expect(result.removedOptimisticIds).toEqual(['opt-1']);
    expect(result.messages).toHaveLength(1);
  });

  it('no-match append: adds server row when no pending match', () => {
    const result = reconcileOptimisticMessages({
      messages: [server('srv-1', { content: 'first' }) as ChatMessageWithStatus],
      incoming: [
        server('srv-2', {
          senderId: 'other-user',
          clientMutationId: 'cid-x',
          content: 'from peer',
          createdAt: '2026-01-01T00:00:03.000Z',
        }),
      ],
      userId: USER,
    });
    expect(result.actions).toEqual(['append']);
    expect(result.messages.map((m) => m.id)).toEqual(['srv-1', 'srv-2']);
  });

  it('fingerprint match replaces legacy pending without clientMutationId', () => {
    const result = reconcileOptimisticMessages({
      messages: [
        optimistic('opt-legacy', {
          _clientMutationId: undefined,
          content: 'legacy text',
          replyToId: 'reply-1',
          mentionIds: ['m2', 'm1'],
        }),
      ],
      incoming: [
        server('srv-legacy', {
          clientMutationId: undefined,
          content: 'legacy text',
          replyToId: 'reply-1',
          mentionIds: ['m1', 'm2'],
        }),
      ],
      userId: USER,
    });
    expect(result.actions).toEqual(['replace']);
    expect(result.messages[0]!.id).toBe('srv-legacy');
  });

  it('matches FAILED pending rows the same as SENDING', () => {
    const result = reconcileOptimisticMessages({
      messages: [optimistic('opt-fail', { _status: 'FAILED', _clientMutationId: 'cid-f' })],
      incoming: [server('srv-f', { clientMutationId: 'cid-f' })],
      userId: USER,
      optimisticIdHint: 'opt-fail',
    });
    expect(result.actions).toEqual(['replace']);
    expect(result.messages[0]!._status).toBeUndefined();
  });
});

describe('stripPendingOptimisticsMatchedByServer', () => {
  it('removes pending row when server has same clientMutationId', () => {
    const rows = [
      optimistic('opt-1', { _clientMutationId: 'cid-a' }),
      server('srv-1', { clientMutationId: 'cid-a' }) as ChatMessageWithStatus,
    ];
    const stripped = stripPendingOptimisticsMatchedByServer(rows, [
      server('srv-1', { clientMutationId: 'cid-a' }),
    ]);
    expect(stripped).toHaveLength(1);
    expect(stripped[0]!.id).toBe('srv-1');
  });
});

describe('mergeChatMessagesAscending optimistic dedupe', () => {
  it('drops pending optimistic when merging server row with same clientMutationId', () => {
    const prev = [optimistic('opt-1', { _clientMutationId: 'cid-a' })];
    const incoming = [server('srv-1', { clientMutationId: 'cid-a' })];
    const merged = mergeChatMessagesAscending(prev, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe('srv-1');
    expect(merged[0]!._status).toBeUndefined();
  });
});

describe('findPendingOptimisticIndex', () => {
  it('finds SENDING row by clientMutationId', () => {
    const idx = findPendingOptimisticIndex(
      [optimistic('opt-1', { _clientMutationId: 'cid-a' })],
      'cid-a'
    );
    expect(idx).toBe(0);
  });
});

describe('open rehydrate queue matching (production helper)', () => {
  function queued(tempId: string, cid: string): QueuedMessage {
    return {
      tempId,
      contextType: 'GAME',
      contextId: 'g1',
      payload: { content: 'hello', chatType: 'PUBLIC' },
      createdAt: '2026-01-01T00:00:01.000Z',
      status: 'queued',
      clientMutationId: cid,
    };
  }

  it('matches queued row to rehydrated server message by clientMutationId', () => {
    expect(
      serverMessageMatchesQueuedItem(
        queued('opt-1', 'cid-a'),
        {
          id: 'srv-1',
          senderId: USER,
          content: 'other',
          chatType: 'PUBLIC',
          clientMutationId: 'cid-a',
        },
        USER
      )
    ).toBe(true);
  });
});
