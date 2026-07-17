import { describe, expect, it } from 'vitest';
import { buildReplyToRef } from './buildReplyToRef';

describe('buildReplyToRef', () => {
  it('copies sticker and media fields for reply preview', () => {
    expect(
      buildReplyToRef({
        id: 'm1',
        content: '',
        messageType: 'STICKER',
        mediaUrls: [],
        thumbnailUrls: [],
        stickerId: 'st1',
        stickerEmoji: '🔥',
        sender: { id: 'u1', firstName: 'Ada' },
      })
    ).toEqual({
      id: 'm1',
      content: '',
      messageType: 'STICKER',
      mediaUrls: undefined,
      thumbnailUrls: undefined,
      stickerId: 'st1',
      stickerEmoji: '🔥',
      audioDurationMs: undefined,
      videoDurationMs: undefined,
      sender: { id: 'u1', firstName: 'Ada' },
    });

    const imageRef = buildReplyToRef({
      id: 'm2',
      content: '',
      messageType: 'IMAGE',
      mediaUrls: ['https://cdn/x.gif'],
      thumbnailUrls: ['https://cdn/x-thumb.jpg'],
      sender: null,
    });
    expect(imageRef.mediaUrls).toEqual(['https://cdn/x.gif']);
    expect(imageRef.thumbnailUrls).toEqual(['https://cdn/x-thumb.jpg']);
  });
});
