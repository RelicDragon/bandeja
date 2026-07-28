import { ChatSyncEventType } from '@bandeja/chat-contract';
import { describe, expect, it } from 'vitest';
import type { ChatMessageWithStatus } from '@/api/chat';
import {
  applyAllReadToOwnVisibleMessages,
  applySyncReadBatchToMessages,
} from '@/services/chat/chatSyncReadBatchReact';
import { chatSyncEventsToPatches } from '@/services/chat/chatSyncEventsToPatches';
import { resolveOwnMessageTicks } from '@/services/chat/messageTickState';
import type { MaxPeerReadCursor } from '@/services/chat/peerReadCursor';

function ownMsg(id: string, senderId = 'sender-a'): ChatMessageWithStatus {
  const createdAt = '2026-01-01T00:00:00.000Z';
  return {
    id,
    chatContextType: 'USER',
    contextId: 'chat-1',
    senderId,
    content: `msg ${id}`,
    mediaUrls: [],
    thumbnailUrls: [],
    mentionIds: [],
    state: 'DELIVERED',
    chatType: 'PUBLIC',
    createdAt,
    updatedAt: createdAt,
    sender: null,
    reactions: [],
    readReceipts: [],
    serverSyncSeq: 10,
  };
}

const peerCovering: MaxPeerReadCursor = {
  chatContextType: 'USER',
  contextId: 'chat-1',
  chatType: 'PUBLIC',
  readMaxServerSyncSeq: 10,
  readMaxCreatedAt: '2026-01-01T00:00:00.000Z',
  readMaxMessageId: 'm2',
  updatedAt: '2026-01-01T01:00:00.000Z',
};

describe('applyAllReadToOwnVisibleMessages', () => {
  it('stamps dual-write receipts; new-client ticks still require peer cursor', () => {
    const prev = [ownMsg('m1'), ownMsg('m2'), ownMsg('m3', 'other-b')];
    const readAt = '2026-01-01T01:00:00.000Z';
    const { next, changed, messageIds } = applyAllReadToOwnVisibleMessages(
      prev,
      'reader-b',
      readAt,
      'sender-a'
    );
    expect(changed).toBe(true);
    expect(messageIds).toEqual(['m1', 'm2']);
    expect(next[0]!.readReceipts.some((r) => r.userId === 'reader-b')).toBe(true);
    expect(next[1]!.readReceipts.some((r) => r.userId === 'reader-b')).toBe(true);
    expect(resolveOwnMessageTicks(next[0]!)).toEqual({ tickRead: false, tickDelivered: true });
    expect(resolveOwnMessageTicks(next[0]!, 'sender-a', peerCovering)).toEqual({
      tickRead: true,
      tickDelivered: false,
    });
    expect(resolveOwnMessageTicks(next[2]!, 'sender-a', peerCovering)).toEqual({
      tickRead: false,
      tickDelivered: true,
    });
  });

  it('is idempotent when reader receipt already present', () => {
    const readAt = '2026-01-01T01:00:00.000Z';
    const prev = [
      {
        ...ownMsg('m1'),
        readReceipts: [{ id: 'r1', messageId: 'm1', userId: 'reader-b', readAt }],
      },
    ];
    const { changed } = applyAllReadToOwnVisibleMessages(prev, 'reader-b', readAt, 'sender-a');
    expect(changed).toBe(false);
  });
});

describe('allRead socket + sync batch fixture', () => {
  it('sync batch patches receipts; ticks follow peer cursor on new client', () => {
    const readAt = '2026-01-01T01:00:00.000Z';
    const prev = [ownMsg('m1'), ownMsg('m2')];

    const afterSocket = applyAllReadToOwnVisibleMessages(prev, 'reader-b', readAt, 'sender-a').next;
    expect(afterSocket[0]!.readReceipts.some((r) => r.userId === 'reader-b')).toBe(true);

    const patches = chatSyncEventsToPatches([
      {
        seq: 42,
        eventType: ChatSyncEventType.MESSAGES_READ_BATCH,
        payload: { userId: 'reader-b', readAt, messageIds: ['m1', 'm2'] },
      },
    ]);
    expect(patches).toEqual([
      { op: 'readBatch', userId: 'reader-b', readAt, messageIds: ['m1', 'm2'] },
    ]);

    const afterBatch = applySyncReadBatchToMessages(afterSocket, 'reader-b', readAt, ['m1', 'm2']).next;
    expect(resolveOwnMessageTicks(afterBatch[0]!)).toEqual({ tickRead: false, tickDelivered: true });
    expect(resolveOwnMessageTicks(afterBatch[0]!, 'sender-a', peerCovering)).toEqual({
      tickRead: true,
      tickDelivered: false,
    });
    expect(resolveOwnMessageTicks(afterBatch[1]!, 'sender-a', peerCovering)).toEqual({
      tickRead: true,
      tickDelivered: false,
    });
  });
});
