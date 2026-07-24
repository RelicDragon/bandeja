import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import {
  buildForwardPayload,
  buildForwardedFromInfo,
  isForwardableMessage,
} from './forwardMessage';

function msg(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    chatContextType: 'USER',
    contextId: 'uc1',
    senderId: 'u1',
    messageType: 'TEXT',
    content: '',
    mediaUrls: [],
    thumbnailUrls: [],
    stickerId: null,
    stickerEmoji: null,
    sender: { id: 'u1', firstName: 'Ada', lastName: 'Lovelace' },
    ...overrides,
  } as unknown as ChatMessage;
}

describe('isForwardableMessage', () => {
  it('allows TEXT / IMAGE / STICKER / VIDEO / DOCUMENT with a sender', () => {
    expect(isForwardableMessage(msg({ messageType: 'TEXT' }))).toBe(true);
    expect(isForwardableMessage(msg({ messageType: 'IMAGE' }))).toBe(true);
    expect(isForwardableMessage(msg({ messageType: 'STICKER', stickerId: 's1' }))).toBe(true);
    expect(isForwardableMessage(msg({ messageType: 'VIDEO' }))).toBe(true);
    expect(isForwardableMessage(msg({ messageType: 'DOCUMENT' }))).toBe(true);
  });

  it('rejects system, voice, and poll messages', () => {
    expect(isForwardableMessage(msg({ senderId: null }))).toBe(false);
    expect(isForwardableMessage(msg({ messageType: 'VOICE' }))).toBe(false);
    expect(isForwardableMessage(msg({ messageType: 'POLL' }))).toBe(false);
  });
});

describe('buildForwardedFromInfo', () => {
  it('uses sender name and source chat for a first forward', async () => {
    const info = await buildForwardedFromInfo(msg({ id: 'orig1' }));
    expect(info).toEqual({
      title: 'Ada Lovelace',
      chatContextType: 'USER',
      contextId: 'uc1',
      messageId: 'orig1',
    });
  });

  it('keeps root attribution when forwarding a forwarded message', async () => {
    const info = await buildForwardedFromInfo(
      msg({
        id: 'fwd2',
        forwardedFromMessageId: 'orig1',
        forwardedFrom: {
          title: 'Ada Lovelace',
          chatContextType: 'USER',
          contextId: 'uc1',
          messageId: 'orig1',
        },
      })
    );
    expect(info.messageId).toBe('orig1');
    expect(info.title).toBe('Ada Lovelace');
  });
});

describe('buildForwardPayload', () => {
  it('always links to the selected message id (nested-forward safe)', async () => {
    const built = await buildForwardPayload(
      msg({
        id: 'fwd2',
        messageType: 'TEXT',
        content: 'hi',
        forwardedFromMessageId: 'orig1',
        forwardedFrom: {
          title: 'Ada Lovelace',
          chatContextType: 'USER',
          contextId: 'uc1',
          messageId: 'orig1',
        },
      })
    );
    expect(built!.payload.forwardedFromMessageId).toBe('fwd2');
    expect(built!.payload.forwardedFrom?.messageId).toBe('orig1');
  });

  it('builds a STICKER payload with selected id (no media)', async () => {
    const built = await buildForwardPayload(
      msg({ messageType: 'STICKER', stickerId: 's1', stickerEmoji: '🎾' })
    );
    expect(built).not.toBeNull();
    expect(built!.payload.messageType).toBe('STICKER');
    expect(built!.payload.stickerId).toBe('s1');
    expect(built!.payload.forwardedFromMessageId).toBe('m1');
    expect(built!.payload.forwardedFrom?.title).toBe('Ada Lovelace');
    expect(built!.mediaUrls).toEqual([]);
  });

  it('builds an IMAGE payload reusing hosted media urls for optimistic UI', async () => {
    const built = await buildForwardPayload(
      msg({
        messageType: 'IMAGE',
        content: 'caption',
        mediaUrls: ['https://cdn.example/chat/giphy-abc.gif'],
        thumbnailUrls: ['https://cdn.example/chat/giphy-abc.thumb.jpg'],
      })
    );
    expect(built).not.toBeNull();
    expect(built!.payload.messageType).toBe('IMAGE');
    expect(built!.payload.forwardedFromMessageId).toBe('m1');
    expect(built!.mediaUrls).toEqual(['https://cdn.example/chat/giphy-abc.gif']);
  });

  it('builds VIDEO and DOCUMENT payloads with metadata + forward link', async () => {
    const video = await buildForwardPayload(
      msg({
        messageType: 'VIDEO',
        mediaUrls: ['https://cdn.example/v.mp4'],
        thumbnailUrls: ['https://cdn.example/v.jpg'],
        videoDurationMs: 1200,
        videoWidth: 640,
        videoHeight: 360,
      })
    );
    expect(video!.payload.messageType).toBe('VIDEO');
    expect(video!.payload.videoDurationMs).toBe(1200);
    expect(video!.payload.forwardedFromMessageId).toBe('m1');

    const doc = await buildForwardPayload(
      msg({
        messageType: 'DOCUMENT',
        mediaUrls: ['https://cdn.example/file.pdf'],
        documentFileName: 'rules.pdf',
        documentMimeType: 'application/pdf',
        documentSize: 99,
      })
    );
    expect(doc!.payload.messageType).toBe('DOCUMENT');
    expect(doc!.payload.documentFileName).toBe('rules.pdf');
    expect(doc!.payload.forwardedFromMessageId).toBe('m1');
  });

  it('drops reply/mentions (forwarded copy starts clean)', async () => {
    const built = await buildForwardPayload(msg({ messageType: 'TEXT', content: 'hi' }));
    expect(built!.payload.replyToId).toBeUndefined();
    expect(built!.payload.mentionIds).toEqual([]);
    expect(built!.payload.chatType).toBe('PUBLIC');
  });

  it('returns null for non-forwardable messages', async () => {
    expect(await buildForwardPayload(msg({ messageType: 'VOICE' }))).toBeNull();
    expect(await buildForwardPayload(msg({ senderId: null }))).toBeNull();
  });
});
