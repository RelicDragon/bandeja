import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import { mergeMessagePreservingReceipts } from '../mergeMessagePreservingReceipts';

function msg(
  id: string,
  receipts: ChatMessage['readReceipts'] = []
): ChatMessage {
  return {
    id,
    chatContextType: 'USER',
    contextId: 'c1',
    senderId: 'u1',
    content: id,
    mediaUrls: [],
    thumbnailUrls: [],
    mentionIds: [],
    state: 'DELIVERED',
    chatType: 'PUBLIC',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sender: null,
    reactions: [],
    readReceipts: receipts,
  };
}

describe('mergeMessagePreservingReceipts', () => {
  it('keeps existing receipts when incoming has none', () => {
    const existing = msg('m1', [
      { id: 'r1', messageId: 'm1', userId: 'u2', readAt: '2026-01-01T01:00:00.000Z' },
    ]);
    const incoming = msg('m1', []);
    const out = mergeMessagePreservingReceipts(existing, { ...incoming, content: 'edited' });
    expect(out.content).toBe('edited');
    expect(out.readReceipts).toHaveLength(1);
    expect(out.readReceipts[0]?.userId).toBe('u2');
  });

  it('keeps an existing delete tombstone when incoming omits deletedAt', () => {
    const existing = { ...msg('m1'), deletedAt: '2026-01-01T03:00:00.000Z' };
    const incoming = msg('m1', []);
    const out = mergeMessagePreservingReceipts(existing, incoming);
    expect(out.deletedAt).toBe('2026-01-01T03:00:00.000Z');
  });

  it('keeps an existing delete tombstone when incoming is null', () => {
    const existing = { ...msg('m1'), deletedAt: '2026-01-01T03:00:00.000Z' };
    const incoming = { ...msg('m1', []), deletedAt: null };
    const out = mergeMessagePreservingReceipts(existing, incoming);
    expect(out.deletedAt).toBe('2026-01-01T03:00:00.000Z');
  });

  it('merges receipts from both sides', () => {
    const existing = msg('m1', [
      { id: 'r1', messageId: 'm1', userId: 'u2', readAt: '2026-01-01T01:00:00.000Z' },
    ]);
    const incoming = msg('m1', [
      { id: 'r2', messageId: 'm1', userId: 'u3', readAt: '2026-01-01T02:00:00.000Z' },
    ]);
    const out = mergeMessagePreservingReceipts(existing, incoming);
    expect(out.readReceipts.map((r) => r.userId).sort()).toEqual(['u2', 'u3']);
  });

  it('returns incoming when no existing row', () => {
    const incoming = msg('m1', []);
    expect(mergeMessagePreservingReceipts(undefined, incoming)).toBe(incoming);
  });
});
