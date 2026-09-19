import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import type { MessageRowHandlers } from './types';
import { messageRowPropsEqual, toMessageRowMemoProps } from './messageRowPropsEqual';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    senderId: 'u1',
    content: 'hi',
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
    messageType: 'TEXT',
    reactions: [],
    readReceipts: [],
    sender: null,
    ...overrides,
  } as unknown as ChatMessage;
}

const NOOP = () => {};

describe('messageRowPropsEqual', () => {
  it('treats an unchanged row as equal', () => {
    const handlers: MessageRowHandlers = { onAddReaction: NOOP };
    const msg = message();
    const props = { message: msg, handlers };
    expect(
      messageRowPropsEqual(toMessageRowMemoProps(props), toMessageRowMemoProps({ ...props }))
    ).toBe(true);
  });

  it('re-renders when the handler bundle is swapped', () => {
    // Real case: read-only → writable once the game context resolves, which replaces every
    // callback. Missing this left rows holding `undefined` reaction/pin handlers.
    const msg = message();
    const readOnly: MessageRowHandlers = {};
    const writable: MessageRowHandlers = { onAddReaction: NOOP, onRemoveReaction: NOOP };
    expect(
      messageRowPropsEqual(
        toMessageRowMemoProps({ message: msg, handlers: readOnly }),
        toMessageRowMemoProps({ message: msg, handlers: writable })
      )
    ).toBe(false);
  });

  it('re-renders when entityType arrives with the game context', () => {
    const msg = message({ senderId: null });
    const handlers: MessageRowHandlers = {};
    expect(
      messageRowPropsEqual(
        toMessageRowMemoProps({ message: msg, handlers, entityType: undefined }),
        toMessageRowMemoProps({ message: msg, handlers, entityType: 'LEAGUE' })
      )
    ).toBe(false);
  });

  it('re-renders when a transcription lands without an updatedAt bump', () => {
    const handlers: MessageRowHandlers = {};
    const before = message({ messageType: 'VOICE' });
    const after = message({
      messageType: 'VOICE',
      audioTranscription: { transcription: 'hello there', languageCode: 'en' },
    });
    expect(
      messageRowPropsEqual(
        toMessageRowMemoProps({ message: before, handlers }),
        toMessageRowMemoProps({ message: after, handlers })
      )
    ).toBe(false);
  });

  it('re-renders when an auto-translation is appended', () => {
    const handlers: MessageRowHandlers = {};
    const before = message();
    const after = message({ translations: [{ languageCode: 'es', translation: 'hola' }] });
    expect(
      messageRowPropsEqual(
        toMessageRowMemoProps({ message: before, handlers }),
        toMessageRowMemoProps({ message: after, handlers })
      )
    ).toBe(false);
  });

  it('re-renders when the chat-request responder ids arrive', () => {
    const handlers: MessageRowHandlers = {};
    const msg = message({ senderId: null });
    expect(
      messageRowPropsEqual(
        toMessageRowMemoProps({ message: msg, handlers }),
        toMessageRowMemoProps({
          message: msg,
          handlers,
          userChatUser1Id: 'u1',
          userChatUser2Id: 'u2',
        })
      )
    ).toBe(false);
  });
});
