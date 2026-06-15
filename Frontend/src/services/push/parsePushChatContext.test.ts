import { describe, expect, it } from 'vitest';
import { parsePushChatContext } from './parsePushChatContext';

describe('parsePushChatContext', () => {
  it('parses iOS nested GAME_CHAT payload', () => {
    expect(
      parsePushChatContext({
        type: 'GAME_CHAT',
        data: {
          gameId: 'game-1',
          messageId: 'msg-1',
          chatType: 'PRIVATE',
        },
      })
    ).toEqual({
      type: 'GAME_CHAT',
      chatContextType: 'GAME',
      contextId: 'game-1',
      messageId: 'msg-1',
      chatType: 'PRIVATE',
      gameId: 'game-1',
    });
  });

  it('parses Android flat USER_CHAT payload', () => {
    expect(
      parsePushChatContext({
        type: 'USER_CHAT',
        userChatId: 'chat-9',
        messageId: 'msg-9',
        userId: 'user-1',
      })
    ).toEqual({
      type: 'USER_CHAT',
      chatContextType: 'USER',
      contextId: 'chat-9',
      messageId: 'msg-9',
      userChatId: 'chat-9',
      userId: 'user-1',
    });
  });

  it('parses explicit chatContextType and contextId', () => {
    expect(
      parsePushChatContext({
        type: 'GROUP_CHAT',
        data: {
          chatContextType: 'GROUP',
          contextId: 'channel-2',
          messageId: 'msg-2',
          groupChannelId: 'channel-2',
        },
      })
    ).toEqual({
      type: 'GROUP_CHAT',
      chatContextType: 'GROUP',
      contextId: 'channel-2',
      messageId: 'msg-2',
      groupChannelId: 'channel-2',
    });
  });

  it('parses GROUP_CHAT with marketplace item id', () => {
    expect(
      parsePushChatContext({
        type: 'GROUP_CHAT',
        data: {
          chatContextType: 'GROUP',
          contextId: 'channel-3',
          messageId: 'msg-3',
          groupChannelId: 'channel-3',
          marketItemId: 'item-3',
        },
      })
    ).toEqual({
      type: 'GROUP_CHAT',
      chatContextType: 'GROUP',
      contextId: 'channel-3',
      messageId: 'msg-3',
      groupChannelId: 'channel-3',
      marketItemId: 'item-3',
    });
  });

  it('returns null for story-style USER_CHAT without chat context', () => {
    expect(
      parsePushChatContext({
        type: 'USER_CHAT',
        data: {
          sourceType: 'STORY',
          sourceId: 'story-1',
          ownerUserId: 'owner-1',
          userId: 'actor-1',
        },
      })
    ).toBeNull();
  });

  it('returns null when messageId is missing', () => {
    expect(
      parsePushChatContext({
        type: 'BUG_CHAT',
        bugId: 'bug-1',
      })
    ).toBeNull();
  });

  it('returns null for non-chat notification types', () => {
    expect(
      parsePushChatContext({
        type: 'INVITE',
        data: { gameId: 'game-1', inviteId: 'inv-1' },
      })
    ).toBeNull();
  });
});
