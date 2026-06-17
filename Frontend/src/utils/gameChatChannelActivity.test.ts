import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import {
  chatMessageActivatesGameChannel,
  gameChatChannelIsActive,
} from './gameChatChannelActivity';
import { SystemMessageType } from './systemMessages';

function msg(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    chatContextType: 'GAME',
    contextId: 'g1',
    content: '',
    chatType: 'PUBLIC',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as ChatMessage;
}

function systemContent(type: SystemMessageType): string {
  return JSON.stringify({ type, variables: {}, text: type });
}

describe('gameChatChannelIsActive', () => {
  it('activates PRIVATE on user message', () => {
    const messages = [msg({ chatType: 'PRIVATE', senderId: 'u1', content: 'hi' })];
    expect(gameChatChannelIsActive(messages, 'PRIVATE')).toBe(true);
  });

  it('activates PRIVATE on participants-only creation system message', () => {
    const messages = [
      msg({
        chatType: 'PRIVATE',
        senderId: null,
        content: systemContent(SystemMessageType.PARTICIPANTS_ONLY_CHAT_CREATED),
      }),
    ];
    expect(gameChatChannelIsActive(messages, 'PRIVATE')).toBe(true);
  });

  it('activates ADMINS on admins chat creation system message', () => {
    const messages = [
      msg({
        chatType: 'ADMINS',
        senderId: null,
        content: systemContent(SystemMessageType.ADMINS_CHAT_CREATED),
      }),
    ];
    expect(gameChatChannelIsActive(messages, 'ADMINS')).toBe(true);
  });

  it('does not activate empty channel', () => {
    expect(gameChatChannelIsActive([], 'PRIVATE')).toBe(false);
  });
});

describe('chatMessageActivatesGameChannel', () => {
  it('returns PRIVATE for matching activation message', () => {
    const message = msg({
      chatType: 'PRIVATE',
      senderId: null,
      content: systemContent(SystemMessageType.PARTICIPANTS_ONLY_CHAT_CREATED),
    });
    expect(chatMessageActivatesGameChannel(message)).toBe('PRIVATE');
  });

  it('returns null for unrelated system message', () => {
    const message = msg({
      chatType: 'PUBLIC',
      senderId: null,
      content: systemContent(SystemMessageType.USER_JOINED_GAME),
    });
    expect(chatMessageActivatesGameChannel(message)).toBeNull();
  });
});
