import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import {
  getReplyPreviewDisplayContent,
  getReplyPreviewMediaThumbUrl,
  looksLikeGifMediaUrl,
} from './replyPreviewContent';

const t = ((key: string, opts?: { defaultValue?: string }) =>
  opts?.defaultValue ?? key) as TFunction;

describe('looksLikeGifMediaUrl', () => {
  it('detects provider hosts, .gif paths, and rehosted giphy stems', () => {
    expect(looksLikeGifMediaUrl('https://media.giphy.com/x.gif')).toBe(true);
    expect(looksLikeGifMediaUrl('https://cdn.example.com/uploads/chat/a.gif')).toBe(true);
    expect(looksLikeGifMediaUrl('/uploads/chat/originals/giphy.webp')).toBe(true);
    expect(looksLikeGifMediaUrl('https://cdn.example.com/uploads/chat/a.jpg')).toBe(false);
  });
});

describe('getReplyPreviewDisplayContent', () => {
  it('labels stickers (including stickerId without messageType)', () => {
    expect(
      getReplyPreviewDisplayContent(
        {
          id: '1',
          content: '',
          messageType: 'STICKER',
          stickerEmoji: '🎾',
          sender: { id: 'u' },
        },
        t
      )
    ).toBe('🎾 Sticker');

    expect(
      getReplyPreviewDisplayContent(
        {
          id: '2',
          content: '',
          stickerId: 'st-1',
          sender: { id: 'u' },
        },
        t
      )
    ).toBe('Sticker');
  });

  it('labels GIF and photo media instead of empty content', () => {
    expect(
      getReplyPreviewDisplayContent(
        {
          id: '3',
          content: '',
          messageType: 'IMAGE',
          mediaUrls: ['https://cdn.example.com/x.gif'],
          sender: { id: 'u' },
        },
        t
      )
    ).toBe('GIF');

    expect(
      getReplyPreviewDisplayContent(
        {
          id: '3b',
          content: '',
          messageType: 'IMAGE',
          mediaUrls: ['/uploads/chat/originals/giphy.webp'],
          sender: { id: 'u' },
        },
        t
      )
    ).toBe('GIF');

    expect(
      getReplyPreviewDisplayContent(
        {
          id: '4',
          content: '',
          messageType: 'IMAGE',
          mediaUrls: ['https://cdn.example.com/x.jpg'],
          sender: { id: 'u' },
        },
        t
      )
    ).toBe('Photo');
  });

  it('prefers caption text over Photo/GIF label', () => {
    expect(
      getReplyPreviewDisplayContent(
        {
          id: '4c',
          content: 'nice shot',
          messageType: 'IMAGE',
          mediaUrls: ['https://cdn.example.com/x.jpg'],
          sender: { id: 'u' },
        },
        t
      )
    ).toBe('nice shot');
  });

  it('keeps voice/video labels even when mediaUrls present', () => {
    expect(
      getReplyPreviewDisplayContent(
        {
          id: 'v1',
          content: '',
          messageType: 'VOICE',
          mediaUrls: ['blob:audio'],
          sender: { id: 'u' },
        },
        t
      )
    ).toBe('Voice message');
    expect(
      getReplyPreviewDisplayContent(
        {
          id: 'v2',
          content: '',
          messageType: 'VIDEO',
          mediaUrls: ['blob:video'],
          sender: { id: 'u' },
        },
        t
      )
    ).toBe('Video');
  });

  it('falls back for empty text replies', () => {
    expect(
      getReplyPreviewDisplayContent(
        { id: '5', content: '   ', sender: { id: 'u' } },
        t
      )
    ).toBe('(no text)');
  });
});

describe('getReplyPreviewMediaThumbUrl', () => {
  it('prefers thumbnailUrls then mediaUrls for image replies', () => {
    expect(
      getReplyPreviewMediaThumbUrl({
        id: '1',
        content: '',
        messageType: 'IMAGE',
        mediaUrls: ['https://cdn.example.com/x.gif'],
        thumbnailUrls: ['https://cdn.example.com/x-thumb.jpg'],
        sender: { id: 'u' },
      })
    ).toBe('https://cdn.example.com/x-thumb.jpg');

    expect(
      getReplyPreviewMediaThumbUrl({
        id: '1b',
        content: '',
        messageType: 'IMAGE',
        mediaUrls: ['https://cdn.example.com/x.gif'],
        sender: { id: 'u' },
      })
    ).toBe('https://cdn.example.com/x.gif');

    expect(
      getReplyPreviewMediaThumbUrl({
        id: '2',
        content: '',
        messageType: 'STICKER',
        stickerId: 'st',
        sender: { id: 'u' },
      })
    ).toBeNull();
  });
});
