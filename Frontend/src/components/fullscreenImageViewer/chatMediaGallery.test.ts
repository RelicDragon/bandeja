import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import { buildChatMediaGallery } from './chatMediaGallery';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    chatContextType: 'GAME',
    contextId: 'game-1',
    senderId: 'user-1',
    content: '',
    mediaUrls: [],
    thumbnailUrls: [],
    mentionIds: [],
    state: 'SENT',
    chatType: 'PUBLIC',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    sender: null,
    reactions: [],
    readReceipts: [],
    ...overrides,
  };
}

const scope = {
  contextType: 'GAME' as const,
  contextId: 'game-1',
  chatType: 'PUBLIC' as const,
};

describe('buildChatMediaGallery', () => {
  it('keeps media strictly inside context id and chat type', () => {
    const gallery = buildChatMediaGallery(
      [
        message({ id: 'public', messageType: 'IMAGE', mediaUrls: ['/public.jpg'] }),
        message({
          id: 'private',
          messageType: 'IMAGE',
          chatType: 'PRIVATE',
          mediaUrls: ['/private.jpg'],
        }),
        message({
          id: 'other-game',
          messageType: 'VIDEO',
          contextId: 'game-2',
          mediaUrls: ['/other.mp4'],
        }),
        message({
          id: 'other-context',
          messageType: 'IMAGE',
          chatContextType: 'GROUP',
          mediaUrls: ['/group.jpg'],
        }),
      ],
      scope,
    );

    expect(gallery.map((item) => item.id)).toEqual(['public:media:0']);
  });

  it('preserves timeline and album order with originals and previews', () => {
    const gallery = buildChatMediaGallery(
      [
        message({
          id: 'album',
          messageType: 'IMAGE',
          mediaUrls: ['/one.jpg', '/two.jpg'],
          thumbnailUrls: ['/one-thumb.jpg', '/two-thumb.jpg'],
        }),
        message({
          id: 'video',
          messageType: 'VIDEO',
          mediaUrls: ['/clip.mp4'],
          thumbnailUrls: ['/clip-poster.jpg'],
        }),
      ],
      scope,
    );

    expect(gallery).toMatchObject([
      {
        id: 'album:media:0',
        kind: 'image',
        originalUrl: '/one.jpg',
        previewUrl: '/one-thumb.jpg',
      },
      {
        id: 'album:media:1',
        kind: 'image',
        originalUrl: '/two.jpg',
        previewUrl: '/two-thumb.jpg',
      },
      {
        id: 'video:media:0',
        kind: 'video',
        originalUrl: '/clip.mp4',
        previewUrl: '/clip-poster.jpg',
      },
    ]);
  });

  it('includes previewable documents and excludes non-previewable or deleted media', () => {
    const gallery = buildChatMediaGallery(
      [
        message({
          id: 'image-document',
          messageType: 'DOCUMENT',
          documentMimeType: 'image/png',
          mediaUrls: ['/drawing.png'],
        }),
        message({
          id: 'video-document',
          messageType: 'DOCUMENT',
          documentMimeType: 'video/mp4',
          mediaUrls: ['/recording.mp4'],
          thumbnailUrls: ['/recording.jpg'],
        }),
        message({
          id: 'pdf',
          messageType: 'DOCUMENT',
          documentMimeType: 'application/pdf',
          mediaUrls: ['/file.pdf'],
        }),
        message({ id: 'voice', messageType: 'VOICE', mediaUrls: ['/voice.m4a'] }),
        message({
          id: 'legacy-image-document',
          messageType: 'DOCUMENT',
          documentMimeType: 'application/octet-stream',
          documentFileName: 'court-plan.WEBP',
          mediaUrls: ['/court-plan'],
        }),
        message({
          id: 'legacy-video-document',
          messageType: 'DOCUMENT',
          documentFileName: 'match.mov',
          mediaUrls: ['/download?id=match'],
        }),
        message({ id: 'sticker', messageType: 'STICKER', mediaUrls: ['/sticker.webp'] }),
        message({
          id: 'deleted',
          messageType: 'IMAGE',
          mediaUrls: ['/deleted.jpg'],
          deletedAt: '2026-08-01T11:00:00.000Z',
        }),
      ],
      scope,
    );

    expect(gallery.map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: 'image-document:media:0', kind: 'image' },
      { id: 'video-document:media:0', kind: 'video' },
      { id: 'legacy-image-document:media:0', kind: 'image' },
      { id: 'legacy-video-document:media:0', kind: 'video' },
    ]);
  });

  it('supports historical image messages without messageType', () => {
    const gallery = buildChatMediaGallery(
      [
        message({ id: 'legacy', messageType: undefined, mediaUrls: ['/legacy.jpg'] }),
        message({
          id: 'preview-only',
          messageType: 'IMAGE',
          mediaUrls: [],
          thumbnailUrls: ['/preview-only.jpg'],
        }),
      ],
      scope,
    );

    expect(gallery).toHaveLength(2);
    expect(gallery[0]).toMatchObject({ id: 'legacy:media:0', kind: 'image' });
    expect(gallery[1]).toMatchObject({
      id: 'preview-only:media:0',
      originalUrl: '/preview-only.jpg',
      previewUrl: '/preview-only.jpg',
    });
  });
});
