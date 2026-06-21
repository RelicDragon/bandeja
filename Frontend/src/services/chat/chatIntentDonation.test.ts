import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import { shouldDonateChatIntent } from './chatIntentDonation';

function baseMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    chatContextType: 'USER',
    contextId: 'chat-1',
    senderId: 'user-1',
    content: 'Hello',
    mediaUrls: [],
    thumbnailUrls: [],
    mentionIds: [],
    state: 'SENT',
    chatType: 'PUBLIC',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sender: {
      id: 'user-1',
      firstName: 'Alex',
      lastName: 'One',
      level: 3,
      socialLevel: 3,
      gender: 'MALE',
      approvedLevel: true,
      isTrainer: false,
    },
    reactions: [],
    readReceipts: [],
    ...overrides,
  };
}

describe('shouldDonateChatIntent', () => {
  it('allows replyable chat contexts', () => {
    expect(shouldDonateChatIntent(baseMessage())).toBe(true);
    expect(shouldDonateChatIntent(baseMessage({ chatContextType: 'GAME', contextId: 'game-1' }))).toBe(true);
    expect(shouldDonateChatIntent(baseMessage({ chatContextType: 'GROUP', contextId: 'group-1' }))).toBe(true);
    expect(shouldDonateChatIntent(baseMessage({ chatContextType: 'BUG', contextId: 'bug-1' }))).toBe(true);
  });

  it('skips story engagement messages', () => {
    expect(
      shouldDonateChatIntent(
        baseMessage({
          storyReply: {
            sourceType: 'STORY',
            sourceId: 'story-1',
            ownerUserId: 'owner-1',
          },
        })
      )
    ).toBe(false);
  });

  it('skips messages without ids', () => {
    expect(shouldDonateChatIntent(baseMessage({ id: '' }))).toBe(false);
  });
});
