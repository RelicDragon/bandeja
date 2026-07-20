import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getCachedStickerMock, fetchAndCacheStickerMock } = vi.hoisted(() => ({
  getCachedStickerMock: vi.fn((): unknown => null),
  fetchAndCacheStickerMock: vi.fn(async (): Promise<unknown> => {
    throw new Error('not mocked');
  }),
}));

vi.mock('@/services/stickers/stickerCatalogCache', () => ({
  getCachedSticker: getCachedStickerMock,
  fetchAndCacheSticker: fetchAndCacheStickerMock,
}));

import { resolveMessageCopyTargetUrl } from './copyMessageMedia';

const STATIC = 'https://cdn.example/stickers/ball.webp';
const ANIMATED = 'https://cdn.example/stickers/ball.anim.webp';
const GIF = 'https://cdn.example/chat/giphy-abc.gif';
const PHOTO = 'https://cdn.example/chat/photo.jpg';

const sticker = (overrides: Partial<{ staticUrl: string; animatedUrl: string | null }> = {}) => ({
  id: 's1',
  emoji: '🎾',
  staticUrl: STATIC,
  animatedUrl: ANIMATED,
  ...overrides,
});

describe('resolveMessageCopyTargetUrl', () => {
  beforeEach(() => {
    getCachedStickerMock.mockReset();
    fetchAndCacheStickerMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for text/voice/video/poll messages', async () => {
    await expect(
      resolveMessageCopyTargetUrl({ messageType: 'TEXT', stickerId: null, mediaUrls: [], thumbnailUrls: [] })
    ).resolves.toBeNull();
    await expect(
      resolveMessageCopyTargetUrl({ messageType: 'VOICE', stickerId: null, mediaUrls: [], thumbnailUrls: [] })
    ).resolves.toBeNull();
  });

  it('returns the first media url for IMAGE/GIF at full quality', async () => {
    await expect(
      resolveMessageCopyTargetUrl({
        messageType: 'IMAGE',
        stickerId: null,
        mediaUrls: [GIF, PHOTO],
        thumbnailUrls: [PHOTO],
      })
    ).resolves.toBe(GIF);
  });

  it('falls back to thumbnail when media url is empty', async () => {
    await expect(
      resolveMessageCopyTargetUrl({
        messageType: 'IMAGE',
        stickerId: null,
        mediaUrls: ['', ''],
        thumbnailUrls: [PHOTO],
      })
    ).resolves.toBe(PHOTO);
  });

  it('resolves a sticker from the memory cache, preferring animated', async () => {
    getCachedStickerMock.mockReturnValue(sticker());
    await expect(
      resolveMessageCopyTargetUrl({ messageType: 'STICKER', stickerId: 's1', mediaUrls: [], thumbnailUrls: [] })
    ).resolves.toBe(ANIMATED);
    expect(fetchAndCacheStickerMock).not.toHaveBeenCalled();
  });

  it('fetches the sticker when not cached', async () => {
    getCachedStickerMock.mockReturnValue(null);
    fetchAndCacheStickerMock.mockResolvedValue(sticker());
    await expect(
      resolveMessageCopyTargetUrl({ messageType: 'STICKER', stickerId: 's1', mediaUrls: [], thumbnailUrls: [] })
    ).resolves.toBe(ANIMATED);
    expect(fetchAndCacheStickerMock).toHaveBeenCalledWith('s1');
  });

  it('forces static under reduced motion', async () => {
    getCachedStickerMock.mockReturnValue(sticker());
    await expect(
      resolveMessageCopyTargetUrl(
        { messageType: 'STICKER', stickerId: 's1', mediaUrls: [], thumbnailUrls: [] },
        { reduceMotion: true }
      )
    ).resolves.toBe(STATIC);
  });

  it('returns null when a sticker cannot be resolved (missing/inactive)', async () => {
    getCachedStickerMock.mockReturnValue(null);
    fetchAndCacheStickerMock.mockRejectedValue(new Error('404'));
    await expect(
      resolveMessageCopyTargetUrl({ messageType: 'STICKER', stickerId: 'ghost', mediaUrls: [], thumbnailUrls: [] })
    ).resolves.toBeNull();
  });

  it('returns null for a STICKER message without a stickerId', async () => {
    await expect(
      resolveMessageCopyTargetUrl({ messageType: 'STICKER', stickerId: null, mediaUrls: [], thumbnailUrls: [] })
    ).resolves.toBeNull();
    expect(getCachedStickerMock).not.toHaveBeenCalled();
  });
});
