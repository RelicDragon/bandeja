import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/stickers', () => ({
  getSticker: vi.fn(),
  getStickerPack: vi.fn(),
  listStickerPacks: vi.fn(),
}));

import { getSticker, getStickerPack, listStickerPacks } from '@/api/stickers';
import {
  clearStickerCatalogCaches,
  fetchAndCachePackStickers,
  hydrateStickersByIds,
  invalidateStickerPackListCache,
  listStickerPacksCached,
  putCachedSticker,
} from './stickerCatalogCache';

describe('stickerCatalogCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStickerCatalogCaches();
  });

  it('hydrateStickersByIds uses cache and fetches in parallel', async () => {
    putCachedSticker({
      id: 'a',
      packId: 'p',
      emoji: '🎾',
      title: null,
      staticUrl: '/a.webp',
      animatedUrl: null,
      width: 512,
      height: 512,
      sortOrder: 0,
    });
    vi.mocked(getSticker).mockResolvedValue({
      id: 'b',
      packId: 'p',
      emoji: '🔥',
      title: null,
      staticUrl: '/b.webp',
      animatedUrl: null,
      width: 512,
      height: 512,
      sortOrder: 1,
    });

    const out = await hydrateStickersByIds(['a', 'b']);
    expect(out.map((s) => s.id)).toEqual(['a', 'b']);
    expect(getSticker).toHaveBeenCalledTimes(1);
    expect(getSticker).toHaveBeenCalledWith('b');
  });

  it('listStickerPacksCached reuses TTL cache', async () => {
    vi.mocked(listStickerPacks).mockResolvedValue([
      {
        id: 'pack-1',
        slug: 'reactions',
        title: 'Reactions',
        sport: null,
        locale: null,
        isOfficial: true,
        sortOrder: 0,
        stickerCount: 1,
        coverSticker: null,
      },
    ]);
    const first = await listStickerPacksCached();
    const second = await listStickerPacksCached();
    expect(first).toEqual(second);
    expect(listStickerPacks).toHaveBeenCalledTimes(1);
    expect(listStickerPacks).toHaveBeenCalledWith();
  });

  it('listStickerPacksCached dedupes concurrent cold fetches', async () => {
    let resolveList!: (v: Awaited<ReturnType<typeof listStickerPacks>>) => void;
    vi.mocked(listStickerPacks).mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve;
      })
    );
    const p1 = listStickerPacksCached();
    const p2 = listStickerPacksCached();
    resolveList([
      {
        id: 'pack-1',
        slug: 'reactions',
        title: 'Reactions',
        sport: null,
        locale: null,
        isOfficial: true,
        sortOrder: 0,
        stickerCount: 1,
        coverSticker: null,
      },
    ]);
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toEqual(b);
    expect(listStickerPacks).toHaveBeenCalledTimes(1);
  });

  it('force fetch wins over stale inflight cache write', async () => {
    let resolveStale!: (v: Awaited<ReturnType<typeof listStickerPacks>>) => void;
    let resolveFresh!: (v: Awaited<ReturnType<typeof listStickerPacks>>) => void;
    let call = 0;
    vi.mocked(listStickerPacks).mockImplementation(
      () =>
        new Promise((resolve) => {
          call += 1;
          if (call === 1) resolveStale = resolve;
          else resolveFresh = resolve;
        })
    );

    const stalePromise = listStickerPacksCached();
    invalidateStickerPackListCache();
    const freshPromise = listStickerPacksCached({ force: true });

    resolveFresh([
      {
        id: 'mine',
        slug: 'personal-u1',
        title: 'My stickers',
        sport: null,
        locale: null,
        isOfficial: false,
        ownerUserId: 'u1',
        sortOrder: -100,
        stickerCount: 1,
        coverSticker: null,
      },
    ]);
    const fresh = await freshPromise;
    expect(fresh.map((p) => p.slug)).toEqual(['personal-u1']);

    resolveStale([
      {
        id: 'pack-1',
        slug: 'reactions',
        title: 'Reactions',
        sport: null,
        locale: null,
        isOfficial: true,
        sortOrder: 0,
        stickerCount: 1,
        coverSticker: null,
      },
    ]);
    await stalePromise;

    const after = await listStickerPacksCached();
    expect(after.map((p) => p.slug)).toEqual(['personal-u1']);
    expect(listStickerPacks).toHaveBeenCalledTimes(2);
  });

  it('fetchAndCachePackStickers dedupes inflight', async () => {
    let resolvePack!: (v: { pack: never; stickers: [] }) => void;
    vi.mocked(getStickerPack).mockReturnValue(
      new Promise((resolve) => {
        resolvePack = resolve as typeof resolvePack;
      })
    );
    const p1 = fetchAndCachePackStickers('pack-x');
    const p2 = fetchAndCachePackStickers('pack-x');
    resolvePack({ pack: null as never, stickers: [] });
    await Promise.all([p1, p2]);
    expect(getStickerPack).toHaveBeenCalledTimes(1);
  });
});
