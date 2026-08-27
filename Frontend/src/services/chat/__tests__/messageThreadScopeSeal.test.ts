import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import {
  messageHasExplicitThreadScope,
  sealMessageThreadScope,
} from '@/services/chat/messageThreadScopeSeal';
import { mergeMessagePreservingReceipts } from '@/services/chat/mergeMessagePreservingReceipts';

function base(partial: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'contextId'>): ChatMessage {
  return {
    chatContextType: 'GAME',
    senderId: 'u1',
    content: 'x',
    mediaUrls: [],
    thumbnailUrls: [],
    mentionIds: [],
    state: 'SENT',
    chatType: 'PUBLIC',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sender: null,
    reactions: [],
    readReceipts: [],
    ...partial,
  };
}

describe('messageThreadScopeSeal', () => {
  it('messageHasExplicitThreadScope requires exact match', () => {
    expect(messageHasExplicitThreadScope({ contextId: 'a' }, 'a')).toBe(true);
    expect(messageHasExplicitThreadScope({ contextId: 'b' }, 'a')).toBe(false);
    expect(messageHasExplicitThreadScope({ contextId: '' }, 'a')).toBe(false);
    expect(messageHasExplicitThreadScope({} as { contextId?: string }, 'a')).toBe(false);
  });

  it('seal keeps first contextId', () => {
    const existing = base({ id: 'm1', contextId: 'women' });
    const incoming = base({ id: 'm1', contextId: 'male', content: 'rewritten' });
    const sealed = sealMessageThreadScope(existing, incoming);
    expect(sealed.contextId).toBe('women');
    expect(sealed.content).toBe('rewritten');
  });

  it('mergeMessagePreservingReceipts applies seal', () => {
    const existing = base({ id: 'm1', contextId: 'women' });
    const incoming = base({ id: 'm1', contextId: 'male', content: 'Извините' });
    const merged = mergeMessagePreservingReceipts(existing, incoming);
    expect(merged.contextId).toBe('women');
    expect(merged.content).toBe('Извините');
  });
});
