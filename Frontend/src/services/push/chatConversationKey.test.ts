import { describe, expect, it } from 'vitest';
import { chatConversationKey } from './chatConversationKey';

describe('chatConversationKey', () => {
  it('matches push thread keys for replyable chat contexts', () => {
    expect(chatConversationKey('USER', 'chat-1')).toBe('user-chat:chat-1');
    expect(chatConversationKey('GAME', 'game-1', 'PUBLIC')).toBe('game-chat:game-1:PUBLIC');
    expect(chatConversationKey('GAME', 'game-1', 'PRIVATE')).toBe('game-chat:game-1:PRIVATE');
    expect(chatConversationKey('GROUP', 'channel-1')).toBe('group:channel-1');
    expect(chatConversationKey('BUG', 'bug-1')).toBe('bug:bug-1');
  });

  it('defaults game chat type to PUBLIC', () => {
    expect(chatConversationKey('GAME', 'game-1')).toBe('game-chat:game-1:PUBLIC');
  });
});
