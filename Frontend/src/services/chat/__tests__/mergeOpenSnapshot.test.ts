import { describe, expect, it } from 'vitest';
import { chatOpenMessagesSnapshotEqual, mergeOpenSnapshot } from '@/services/chat/chatOpenSnapshot';
import type { ChatMessageWithStatus } from '@/api/chat';

function msg(id: string, createdAt = '2026-01-01T00:00:00.000Z'): ChatMessageWithStatus {
  return {
    id,
    chatContextType: 'USER',
    contextId: 'c1',
    senderId: 'u1',
    content: id,
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
  };
}

describe('mergeOpenSnapshot (Phase 0 scaffold)', () => {
  it('prepends tail without dropping prev rows', () => {
    const prev = [msg('b'), msg('c')];
    const out = mergeOpenSnapshot(prev, [msg('a')], []);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('merges outbox after tail', () => {
    const prev = [msg('m1')];
    const pending = [{ ...msg('m2'), _optimisticId: 'opt-m2', _status: 'SENDING' as const }];
    const out = mergeOpenSnapshot(prev, [], pending);
    expect(out.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('propagates Dexie read receipts into live rows for reconcile', () => {
    const live = [
      {
        ...msg('m1'),
        readReceipts: [],
      },
    ];
    const dexieTail = [
      {
        ...msg('m1'),
        readReceipts: [
          {
            id: 'rr1',
            messageId: 'm1',
            userId: 'u2',
            readAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      },
    ];
    const out = mergeOpenSnapshot(live, dexieTail, []);
    expect(out[0]!.readReceipts).toHaveLength(1);
    expect(out[0]!.readReceipts[0]!.userId).toBe('u2');
  });

  it('reconcile gate commits when only readReceipts differ (paintSession path)', () => {
    const live = [msg('m1')];
    const dexieTail = [
      {
        ...msg('m1'),
        readReceipts: [
          {
            id: 'rr1',
            messageId: 'm1',
            userId: 'u2',
            readAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      },
    ];
    const next = mergeOpenSnapshot(live, dexieTail, []);
    expect(chatOpenMessagesSnapshotEqual(live, next)).toBe(false);
    expect(next[0]!.readReceipts).toHaveLength(1);
  });
});
