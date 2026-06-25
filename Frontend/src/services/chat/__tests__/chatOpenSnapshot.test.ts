import { describe, expect, it } from 'vitest';
import type { ChatMessageWithStatus } from '@/api/chat';
import {
  chatOpenLikelyHasOlderMessages,
  chatOpenMessageIdsEqual,
  chatOpenMessagesSnapshotEqual,
  pickOpenBaseMessages,
} from '../chatOpenSnapshot';

function msg(id: string, createdAt: string): ChatMessageWithStatus {
  return {
    id,
    chatContextType: 'GAME',
    contextId: 'g1',
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

describe('chatOpenMessageIdsEqual', () => {
  it('returns true for same ordered ids', () => {
    expect(
      chatOpenMessageIdsEqual([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }, { id: 'b' }])
    ).toBe(true);
  });

  it('returns false when length or order differs', () => {
    expect(chatOpenMessageIdsEqual([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }])).toBe(false);
    expect(chatOpenMessageIdsEqual([{ id: 'b' }, { id: 'a' }], [{ id: 'a' }, { id: 'b' }])).toBe(false);
  });
});

describe('chatOpenMessagesSnapshotEqual', () => {
  it('detects updatedAt changes with same ids', () => {
    const a = [{ id: '1', updatedAt: '2020-01-01' }] as const;
    const b = [{ id: '1', updatedAt: '2020-01-02' }] as const;
    expect(chatOpenMessagesSnapshotEqual(a, b)).toBe(false);
  });

  it('detects read-receipt-only changes with same ids and updatedAt', () => {
    const receipt = {
      id: 'rr1',
      messageId: '1',
      userId: 'u2',
      readAt: '2020-01-01T12:00:00.000Z',
    };
    const base = {
      id: '1',
      updatedAt: '2020-01-01',
      readReceipts: [],
    };
    const a = [base] as const;
    const b = [{ ...base, readReceipts: [receipt] }] as const;
    expect(chatOpenMessagesSnapshotEqual(a, b)).toBe(false);
  });
});

describe('chatOpenLikelyHasOlderMessages', () => {
  it('is true when painted count fills a page or Dexie has older rows', () => {
    expect(chatOpenLikelyHasOlderMessages(50, 50)).toBe(true);
    expect(chatOpenLikelyHasOlderMessages(11, 50)).toBe(false);
    expect(chatOpenLikelyHasOlderMessages(11, 50, true)).toBe(true);
  });
});

describe('pickOpenBaseMessages pagination regression', () => {
  it('merges partial L1 with Dexie tail so open paint is not capped by L1 alone', () => {
    const l1 = Array.from({ length: 15 }, (_, i) => msg(`l${i}`, `2026-01-03T10:${String(i).padStart(2, '0')}:00Z`));
    const dexieTail = Array.from({ length: 50 }, (_, i) =>
      msg(`d${i}`, `2026-01-03T09:${String(i).padStart(2, '0')}:00Z`)
    );
    const base = pickOpenBaseMessages({ l1, dexieTail, l1Fresh: true });
    expect(base.length).toBeGreaterThan(l1.length);
    expect(chatOpenLikelyHasOlderMessages(base.length, 50, true)).toBe(true);
  });
});
