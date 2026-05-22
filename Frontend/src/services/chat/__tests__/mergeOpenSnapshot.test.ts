import { describe, expect, it } from 'vitest';
import { mergeOpenSnapshot } from '@/services/chat/chatOpenSnapshot';
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
});
