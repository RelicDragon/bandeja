import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import {
  findPendingOptimisticIndex,
  stripPendingOptimisticsMatchedByServer,
} from './chatOptimisticDedupe';
import { mergeChatMessagesAscending } from './chatMessageSort';

function optimistic(id: string, cid: string): ChatMessageWithStatus {
  return {
    id,
    chatContextType: 'GAME',
    contextId: 'g1',
    senderId: 'u1',
    content: 'hi',
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
    _clientMutationId: cid,
  };
}

function server(id: string, cid: string): ChatMessage {
  return {
    id,
    chatContextType: 'GAME',
    contextId: 'g1',
    senderId: 'u1',
    content: 'hi',
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
    clientMutationId: cid,
  };
}

describe('stripPendingOptimisticsMatchedByServer', () => {
  it('removes pending row when server has same clientMutationId', () => {
    const rows = [optimistic('opt-1', 'cid-a'), server('srv-1', 'cid-a') as ChatMessageWithStatus];
    const stripped = stripPendingOptimisticsMatchedByServer(rows, [server('srv-1', 'cid-a')]);
    expect(stripped).toHaveLength(1);
    expect(stripped[0]!.id).toBe('srv-1');
  });
});

describe('mergeChatMessagesAscending optimistic dedupe', () => {
  it('drops pending optimistic when merging server row with same clientMutationId', () => {
    const prev = [optimistic('opt-1', 'cid-a')];
    const incoming = [server('srv-1', 'cid-a')];
    const merged = mergeChatMessagesAscending(prev, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe('srv-1');
    expect((merged[0] as ChatMessageWithStatus)._status).toBeUndefined();
  });
});

describe('findPendingOptimisticIndex', () => {
  it('finds SENDING row by clientMutationId', () => {
    const idx = findPendingOptimisticIndex([optimistic('opt-1', 'cid-a')], 'cid-a');
    expect(idx).toBe(0);
  });
});
