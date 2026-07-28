import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import { readReceiptsFromOthers, resolveOwnMessageTicks } from './messageTickState';
import type { MaxPeerReadCursor } from './peerReadCursor';

function msg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const createdAt = overrides.createdAt ?? '2026-01-01T00:00:00.000Z';
  return {
    id: 'm1',
    chatContextType: 'GROUP',
    contextId: 'g1',
    senderId: 'sender',
    content: 'hi',
    mediaUrls: [],
    thumbnailUrls: [],
    mentionIds: [],
    state: 'SENT',
    chatType: 'PUBLIC',
    createdAt,
    updatedAt: createdAt,
    sender: null,
    reactions: [],
    readReceipts: [],
    serverSyncSeq: 10,
    ...overrides,
  };
}

const peerPast: MaxPeerReadCursor = {
  chatContextType: 'GROUP',
  contextId: 'g1',
  chatType: 'PUBLIC',
  readMaxServerSyncSeq: 10,
  readMaxCreatedAt: '2026-01-01T00:00:00.000Z',
  readMaxMessageId: 'm1',
  updatedAt: '2026-01-01T01:00:00.000Z',
};

const peerBefore: MaxPeerReadCursor = {
  ...peerPast,
  readMaxServerSyncSeq: 5,
  readMaxMessageId: 'm0',
};

describe('readReceiptsFromOthers', () => {
  it('excludes sender receipts', () => {
    const receipts = readReceiptsFromOthers(
      [
        { id: 'r1', messageId: 'm1', userId: 'sender', readAt: '2026-01-01T01:00:00.000Z' },
        { id: 'r2', messageId: 'm1', userId: 'other', readAt: '2026-01-01T01:01:00.000Z' },
      ],
      'sender'
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.userId).toBe('other');
  });

  it('excludes viewer receipts when senderId is missing', () => {
    const receipts = readReceiptsFromOthers(
      [{ id: 'r1', messageId: 'm1', userId: 'me', readAt: '2026-01-01T01:00:00.000Z' }],
      null,
      'me'
    );
    expect(receipts).toHaveLength(0);
  });
});

describe('resolveOwnMessageTicks', () => {
  it('does not show read without peer cursor', () => {
    expect(resolveOwnMessageTicks(msg())).toEqual({ tickRead: false, tickDelivered: false });
  });

  it('ignores receipts without peer cursor (old-client dual-write is not tick authority)', () => {
    const ticks = resolveOwnMessageTicks(
      msg({
        readReceipts: [{ id: 'r1', messageId: 'm1', userId: 'other', readAt: '2026-01-01T01:00:00.000Z' }],
      })
    );
    expect(ticks).toEqual({ tickRead: false, tickDelivered: false });
  });

  it('ignores receipts when peer cursor is behind message', () => {
    const ticks = resolveOwnMessageTicks(
      msg({
        readReceipts: [{ id: 'r1', messageId: 'm1', userId: 'other', readAt: '2026-01-01T01:00:00.000Z' }],
      }),
      'sender',
      peerBefore
    );
    expect(ticks).toEqual({ tickRead: false, tickDelivered: false });
  });

  it('shows read when peer cursor covers message', () => {
    const ticks = resolveOwnMessageTicks(msg(), 'sender', peerPast);
    expect(ticks).toEqual({ tickRead: true, tickDelivered: false });
  });

  it('late higher seq remains unread until peer cursor advances', () => {
    const ticks = resolveOwnMessageTicks(
      msg({ id: 'm-late', serverSyncSeq: 20, createdAt: '2025-12-01T00:00:00.000Z' }),
      'sender',
      peerPast
    );
    expect(ticks.tickRead).toBe(false);
  });

  it('does not use cursor path when message lacks sync seq', () => {
    const ticks = resolveOwnMessageTicks(
      msg({ serverSyncSeq: undefined, syncSeq: undefined }),
      'sender',
      peerPast
    );
    expect(ticks.tickRead).toBe(false);
  });

  it('ignores message.state READ without peer cursor', () => {
    const ticks = resolveOwnMessageTicks(msg({ state: 'READ' }));
    expect(ticks.tickRead).toBe(false);
  });

  it('shows delivered when state is DELIVERED and not covered by peer cursor', () => {
    const ticks = resolveOwnMessageTicks(msg({ state: 'DELIVERED' }));
    expect(ticks).toEqual({ tickRead: false, tickDelivered: true });
  });

  it('prefers read over delivered when peer cursor covers', () => {
    const ticks = resolveOwnMessageTicks(msg({ state: 'DELIVERED' }), 'sender', peerPast);
    expect(ticks).toEqual({ tickRead: true, tickDelivered: false });
  });

  it('image-only delivered without peer cursor is not read', () => {
    const ticks = resolveOwnMessageTicks(
      msg({
        messageType: 'IMAGE',
        content: '',
        mediaUrls: ['https://cdn.example/photo.jpg'],
        state: 'DELIVERED',
      }),
      'sender'
    );
    expect(ticks).toEqual({ tickRead: false, tickDelivered: true });
  });
});
