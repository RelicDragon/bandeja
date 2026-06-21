import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import { readReceiptsFromOthers, resolveOwnMessageTicks } from './messageTickState';

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
    ...overrides,
  };
}

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
});

describe('resolveOwnMessageTicks', () => {
  it('does not show read for empty receipts', () => {
    expect(resolveOwnMessageTicks(msg())).toEqual({ tickRead: false, tickDelivered: false });
  });

  it('does not show read for sender-only receipt', () => {
    const ticks = resolveOwnMessageTicks(
      msg({
        readReceipts: [{ id: 'r1', messageId: 'm1', userId: 'sender', readAt: '2026-01-01T01:00:00.000Z' }],
      })
    );
    expect(ticks).toEqual({ tickRead: false, tickDelivered: false });
  });

  it('shows read when another user has a receipt', () => {
    const ticks = resolveOwnMessageTicks(
      msg({
        readReceipts: [{ id: 'r1', messageId: 'm1', userId: 'other', readAt: '2026-01-01T01:00:00.000Z' }],
      })
    );
    expect(ticks).toEqual({ tickRead: true, tickDelivered: false });
  });

  it('ignores message.state READ without other receipts', () => {
    const ticks = resolveOwnMessageTicks(msg({ state: 'READ' }));
    expect(ticks.tickRead).toBe(false);
  });

  it('shows delivered when state is DELIVERED and unread by others', () => {
    const ticks = resolveOwnMessageTicks(msg({ state: 'DELIVERED' }));
    expect(ticks).toEqual({ tickRead: false, tickDelivered: true });
  });

  it('prefers read over delivered when others have read', () => {
    const ticks = resolveOwnMessageTicks(
      msg({
        state: 'DELIVERED',
        readReceipts: [{ id: 'r1', messageId: 'm1', userId: 'other', readAt: '2026-01-01T01:00:00.000Z' }],
      })
    );
    expect(ticks).toEqual({ tickRead: true, tickDelivered: false });
  });
});
