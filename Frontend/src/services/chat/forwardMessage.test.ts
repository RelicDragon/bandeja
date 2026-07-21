import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import { buildForwardPayload, isForwardableMessage } from './forwardMessage';

function msg(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    senderId: 'u1',
    messageType: 'TEXT',
    content: '',
    mediaUrls: [],
    thumbnailUrls: [],
    stickerId: null,
    stickerEmoji: null,
    ...overrides,
  } as unknown as ChatMessage;
}

describe('isForwardableMessage', () => {
  it('allows TEXT / IMAGE / STICKER with a sender', () => {
    expect(isForwardableMessage(msg({ messageType: 'TEXT' }))).toBe(true);
    expect(isForwardableMessage(msg({ messageType: 'IMAGE' }))).toBe(true);
    expect(isForwardableMessage(msg({ messageType: 'STICKER', stickerId: 's1' }))).toBe(true);
  });

  it('rejects system, voice, video, and poll messages', () => {
    expect(isForwardableMessage(msg({ senderId: null }))).toBe(false);
    expect(isForwardableMessage(msg({ messageType: 'VOICE' }))).toBe(false);
    expect(isForwardableMessage(msg({ messageType: 'VIDEO' }))).toBe(false);
    expect(isForwardableMessage(msg({ messageType: 'POLL' }))).toBe(false);
  });
});

describe('buildForwardPayload', () => {
  it('builds a STICKER payload reusing stickerId/emoji with no media', () => {
    const built = buildForwardPayload(
      msg({ messageType: 'STICKER', stickerId: 's1', stickerEmoji: '🎾' })
    );
    expect(built).not.toBeNull();
    expect(built!.payload.messageType).toBe('STICKER');
    expect(built!.payload.stickerId).toBe('s1');
    expect(built!.payload.stickerEmoji).toBe('🎾');
    expect(built!.payload.content).toBe('');
    expect(built!.mediaUrls).toEqual([]);
  });

  it('builds an IMAGE payload reusing hosted media urls (no re-upload)', () => {
    const built = buildForwardPayload(
      msg({
        messageType: 'IMAGE',
        content: 'caption',
        mediaUrls: ['https://cdn.example/chat/giphy-abc.gif'],
        thumbnailUrls: ['https://cdn.example/chat/giphy-abc.thumb.jpg'],
      })
    );
    expect(built).not.toBeNull();
    expect(built!.payload.messageType).toBe('IMAGE');
    expect(built!.payload.content).toBe('caption');
    expect(built!.mediaUrls).toEqual(['https://cdn.example/chat/giphy-abc.gif']);
    expect(built!.thumbnailUrls).toEqual(['https://cdn.example/chat/giphy-abc.thumb.jpg']);
  });

  it('builds a TEXT payload', () => {
    const built = buildForwardPayload(msg({ messageType: 'TEXT', content: 'hello' }));
    expect(built!.payload.messageType).toBe('TEXT');
    expect(built!.payload.content).toBe('hello');
  });

  it('drops reply/mentions (forwarded copy starts clean)', () => {
    const built = buildForwardPayload(msg({ messageType: 'TEXT', content: 'hi' }));
    expect(built!.payload.replyToId).toBeUndefined();
    expect(built!.payload.mentionIds).toEqual([]);
    expect(built!.payload.chatType).toBe('PUBLIC');
  });

  it('returns null for non-forwardable messages', () => {
    expect(buildForwardPayload(msg({ messageType: 'VOICE' }))).toBeNull();
    expect(buildForwardPayload(msg({ senderId: null }))).toBeNull();
  });
});
