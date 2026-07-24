import { describe, expect, it } from 'vitest';
import type { ChatMessage, Poll } from '@/api/chat';
import {
  buildForwardPayload,
  buildForwardedFromInfo,
  isForwardableMessage,
} from './forwardMessage';

const samplePoll: Poll = {
  id: 'poll1',
  messageId: 'm-poll',
  question: 'Court A or B?',
  type: 'CLASSICAL',
  isAnonymous: false,
  allowsMultipleAnswers: false,
  options: [],
  votes: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

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
  it('allows TEXT / IMAGE / STICKER / VIDEO / DOCUMENT / VOICE / POLL with hosted media', () => {
    expect(isForwardableMessage(msg({ messageType: 'TEXT' }))).toBe(true);
    expect(
      isForwardableMessage(
        msg({
          messageType: 'IMAGE',
          mediaUrls: ['https://cdn.example/uploads/chat/originals/a.jpg'],
        })
      )
    ).toBe(true);
    expect(isForwardableMessage(msg({ messageType: 'STICKER', stickerId: 's1' }))).toBe(true);
    expect(
      isForwardableMessage(
        msg({
          messageType: 'VIDEO',
          mediaUrls: ['https://cdn.example/uploads/chat/videos/a.mp4'],
          thumbnailUrls: ['https://cdn.example/uploads/chat/thumbnails/a.jpg'],
          videoDurationMs: 1200,
        })
      )
    ).toBe(true);
    expect(
      isForwardableMessage(
        msg({
          messageType: 'DOCUMENT',
          mediaUrls: ['https://cdn.example/uploads/documents/a.pdf'],
          documentFileName: 'rules.pdf',
        })
      )
    ).toBe(true);
    expect(
      isForwardableMessage(
        msg({
          messageType: 'VOICE',
          mediaUrls: ['https://cdn.example/uploads/chat/voice/a.webm'],
          audioDurationMs: 1500,
          waveformData: [0.1, 0.5, 0.2],
        })
      )
    ).toBe(true);
    expect(
      isForwardableMessage(
        msg({
          id: 'm-poll',
          messageType: 'POLL',
          poll: samplePoll,
          content: samplePoll.question,
        })
      )
    ).toBe(true);
  });

  it('rejects provider-hosted GIF image URLs', () => {
    expect(
      isForwardableMessage(
        msg({
          messageType: 'IMAGE',
          mediaUrls: ['https://media.giphy.com/media/abc/giphy.gif'],
        })
      )
    ).toBe(false);
    expect(
      isForwardableMessage(
        msg({
          messageType: 'IMAGE',
          mediaUrls: ['https://cdn.example/uploads/chat/originals/a.gif'],
          thumbnailUrls: ['https://media.tenor.com/x.gif'],
        })
      )
    ).toBe(false);
  });

  it('rejects system, in-flight, incomplete media, and poll without poll payload', () => {
    expect(isForwardableMessage(msg({ senderId: null }))).toBe(false);
    expect(isForwardableMessage(msg({ messageType: 'POLL' }))).toBe(false);
    expect(isForwardableMessage(msg({ _status: 'SENDING' }))).toBe(false);
    expect(isForwardableMessage(msg({ _status: 'FAILED' }))).toBe(false);
    expect(isForwardableMessage(msg({ _optimisticId: 'opt-1' }))).toBe(false);
    expect(isForwardableMessage(msg({ id: 'fwd-abc' }))).toBe(false);
    expect(isForwardableMessage(msg({ id: 'opt-abc' }))).toBe(false);
    expect(
      isForwardableMessage(
        msg({
          messageType: 'VOICE',
          mediaUrls: ['blob:http://local/x'],
          audioDurationMs: 1500,
          waveformData: [0.1],
        })
      )
    ).toBe(false);
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

  it('builds VOICE and POLL link payloads (no re-upload; poll painted locally)', async () => {
    const voice = await buildForwardPayload(
      msg({
        messageType: 'VOICE',
        mediaUrls: ['https://cdn.example/uploads/chat/voice/a.webm'],
        audioDurationMs: 1500,
        waveformData: [0.2, 0.8],
      })
    );
    expect(voice!.payload.messageType).toBe('VOICE');
    expect(voice!.payload.audioDurationMs).toBe(1500);
    expect(voice!.payload.waveformData).toEqual([0.2, 0.8]);
    expect(voice!.payload.forwardedFromMessageId).toBe('m1');

    const poll = await buildForwardPayload(
      msg({
        id: 'm-poll',
        messageType: 'POLL',
        poll: samplePoll,
        content: samplePoll.question,
      })
    );
    expect(poll!.payload.messageType).toBe('POLL');
    expect(poll!.payload.poll?.id).toBe('poll1');
    expect(poll!.payload.forwardedFromMessageId).toBe('m-poll');
    expect(poll!.mediaUrls).toEqual([]);
  });

  it('returns null for non-forwardable messages', async () => {
    expect(await buildForwardPayload(msg({ senderId: null }))).toBeNull();
    expect(await buildForwardPayload(msg({ messageType: 'POLL' }))).toBeNull();
  });
});
