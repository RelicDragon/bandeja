import { describe, expect, it } from 'vitest';
import {
  chatOpenLikelyHasOlderMessages,
  chatOpenMessageIdsEqual,
  chatOpenMessagesSnapshotEqual,
} from '../chatOpenSnapshot';

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
  it('is true only when painted count fills a page', () => {
    expect(chatOpenLikelyHasOlderMessages(50, 50)).toBe(true);
    expect(chatOpenLikelyHasOlderMessages(11, 50)).toBe(false);
  });
});
