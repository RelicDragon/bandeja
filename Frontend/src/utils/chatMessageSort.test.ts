import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import { mergeChatMessagesAscending } from './chatMessageSort';

function msg(
  id: string,
  overrides: Partial<ChatMessage> = {}
): ChatMessageWithStatus {
  const createdAt = overrides.createdAt ?? '2026-01-01T00:00:00.000Z';
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
    ...overrides,
  };
}

describe('mergeChatMessagesAscending', () => {
  it('keeps prev readReceipts when incoming same id has empty receipts', () => {
    const receipt = {
      id: 'rr1',
      messageId: 'm1',
      userId: 'other',
      readAt: '2026-01-01T01:00:00.000Z',
    };
    const prev = [msg('m1', { readReceipts: [receipt] })];
    const incoming = [
      msg('m1', {
        createdAt: '2026-01-01T02:00:00.000Z',
        readReceipts: [],
      }),
    ];
    const merged = mergeChatMessagesAscending(prev, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.readReceipts).toEqual([receipt]);
  });

  it('keeps prev row on equal sort key (tie)', () => {
    const receipt = {
      id: 'rr1',
      messageId: 'm1',
      userId: 'other',
      readAt: '2026-01-01T01:00:00.000Z',
    };
    const prev = [msg('m1', { readReceipts: [receipt], content: 'prev' })];
    const incoming = [msg('m1', { readReceipts: [], content: 'incoming' })];
    const merged = mergeChatMessagesAscending(prev, incoming);
    expect(merged[0]!.content).toBe('prev');
    expect(merged[0]!.readReceipts).toEqual([receipt]);
  });

  it('merges Dexie read receipts when in-memory row wins on sort key', () => {
    const prevReceipt = {
      id: 'rr1',
      messageId: 'm1',
      userId: 'u2',
      readAt: '2026-01-01T01:00:00.000Z',
    };
    const dexieReceipt = {
      id: 'rr2',
      messageId: 'm1',
      userId: 'u3',
      readAt: '2026-01-01T02:00:00.000Z',
    };
    const prev = [msg('m1', { readReceipts: [prevReceipt], content: 'live' })];
    const incoming = [
      msg('m1', {
        readReceipts: [dexieReceipt],
        content: 'dexie',
      }),
    ];
    const merged = mergeChatMessagesAscending(prev, incoming);
    expect(merged[0]!.content).toBe('live');
    expect(merged[0]!.readReceipts).toEqual(
      expect.arrayContaining([prevReceipt, dexieReceipt])
    );
    expect(merged[0]!.readReceipts).toHaveLength(2);
  });
});
