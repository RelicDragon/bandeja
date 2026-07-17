import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./chatMediaCache', () => ({
  mediaCacheKeyForSrc: (src: string) => src,
  readCachedMediaResponse: vi.fn(),
  writeCachedMediaResponse: vi.fn(),
}));

import {
  readCachedMediaResponse,
  writeCachedMediaResponse,
} from './chatMediaCache';
import {
  acquireChatMediaAsset,
  clearChatMediaAssetMemoryCache,
  peekChatMediaAsset,
  primeChatMediaDimensions,
  releaseChatMediaAsset,
} from './chatMediaAssetCache';

describe('chatMediaAssetCache', () => {
  beforeEach(() => {
    clearChatMediaAssetMemoryCache();
    vi.clearAllMocks();
    vi.mocked(readCachedMediaResponse).mockResolvedValue(undefined);
    vi.mocked(writeCachedMediaResponse).mockResolvedValue();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reuses one fetched object URL across virtual row remounts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(['gif'], { type: 'image/gif' }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await acquireChatMediaAsset('https://cdn.example.com/chat/a.gif');
    releaseChatMediaAsset('https://cdn.example.com/chat/a.gif');
    const remounted = await acquireChatMediaAsset('https://cdn.example.com/chat/a.gif');

    expect(remounted.displayUrl).toBe(first.displayUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(writeCachedMediaResponse).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent cold loads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(['gif'], { type: 'image/gif' }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([
      acquireChatMediaAsset('https://cdn.example.com/chat/b.gif'),
      acquireChatMediaAsset('https://cdn.example.com/chat/b.gif'),
    ]);

    expect(second.displayUrl).toBe(first.displayUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses Cache Storage without revalidating over HTTP', async () => {
    vi.mocked(readCachedMediaResponse).mockResolvedValue(
      new Response(new Blob(['cached'], { type: 'image/gif' }), { status: 200 })
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await acquireChatMediaAsset('https://cdn.example.com/chat/c.gif');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeCachedMediaResponse).not.toHaveBeenCalled();
  });

  it('resolves image dimensions before exposing a cold asset', async () => {
    class ImageMock {
      naturalWidth = 320;
      naturalHeight = 180;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', ImageMock);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Blob(['gif'], { type: 'image/gif' }), { status: 200 })
      )
    );

    const asset = await acquireChatMediaAsset('https://cdn.example.com/chat/d.gif');

    expect(asset.dimensions).toEqual({ width: 320, height: 180 });
  });

  it('reserves queued GIF dimensions before the image loads', () => {
    const src = 'https://media.giphy.com/preview.gif';
    primeChatMediaDimensions(src, { width: 320, height: 180 });

    expect(peekChatMediaAsset(src)).toEqual({
      displayUrl: src,
      dimensions: { width: 320, height: 180 },
    });
  });
});
