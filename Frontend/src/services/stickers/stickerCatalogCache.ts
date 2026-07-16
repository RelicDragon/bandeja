import {
  getSticker,
  getStickerPack,
  listStickerPacks,
  type StickerDto,
  type StickerPackListItem,
} from '@/api/stickers';

export type CachedSticker = StickerDto & {
  isActive?: boolean;
  packActive?: boolean;
};

const memory = new Map<string, CachedSticker>();
const inflight = new Map<string, Promise<CachedSticker>>();
const packStickersMemory = new Map<string, StickerDto[]>();
const packStickersInflight = new Map<string, Promise<StickerDto[]>>();
/** Per-pack fetch generation — stale inflight writes must not clobber force/invalidate. */
const packStickersGen = new Map<string, number>();

const PACK_LIST_TTL_MS = 90_000;
type PackListCache = { key: string; at: number; packs: StickerPackListItem[] };
let packListCache: PackListCache | null = null;
let packListInflight: Promise<StickerPackListItem[]> | null = null;
/** Bumped on invalidate/force so older inflight fetches cannot rewrite cache. */
let packListGen = 0;

/** Drop all in-memory sticker catalog caches (pack list, pack rows, by-id). */
export function clearStickerCatalogCaches(): void {
  memory.clear();
  inflight.clear();
  packStickersMemory.clear();
  packStickersInflight.clear();
  packStickersGen.clear();
  packListCache = null;
  packListInflight = null;
  packListGen = 0;
}

export function invalidateStickerPackListCache(): void {
  packListGen += 1;
  packListCache = null;
  packListInflight = null;
}

/** Drop cached pack sticker rows so the tray reloads after save/deactivate. */
export function invalidateStickerPackStickersCache(packId?: string): void {
  if (packId) {
    packStickersGen.set(packId, (packStickersGen.get(packId) ?? 0) + 1);
    packStickersMemory.delete(packId);
    packStickersInflight.delete(packId);
    return;
  }
  for (const id of packStickersGen.keys()) {
    packStickersGen.set(id, (packStickersGen.get(id) ?? 0) + 1);
  }
  packStickersMemory.clear();
  packStickersInflight.clear();
}

export function getCachedSticker(stickerId: string): CachedSticker | null {
  return memory.get(stickerId) ?? null;
}

export function putCachedSticker(sticker: CachedSticker): void {
  memory.set(sticker.id, sticker);
}

export function putCachedStickers(stickers: CachedSticker[]): void {
  for (const s of stickers) memory.set(s.id, s);
}

export async function fetchAndCacheSticker(stickerId: string): Promise<CachedSticker> {
  const hit = memory.get(stickerId);
  if (hit) return hit;

  const pending = inflight.get(stickerId);
  if (pending) return pending;

  const promise = getSticker(stickerId)
    .then((sticker) => {
      putCachedSticker(sticker);
      return sticker;
    })
    .finally(() => {
      inflight.delete(stickerId);
    });

  inflight.set(stickerId, promise);
  return promise;
}

/** Parallel hydrate; prefers memory cache; skips inactive/missing. */
export async function hydrateStickersByIds(ids: string[]): Promise<StickerDto[]> {
  if (ids.length === 0) return [];
  const rows = await Promise.all(
    ids.map(async (id) => {
      const cached = getCachedSticker(id);
      if (cached) return cached.isActive === false ? null : cached;
      try {
        const s = await fetchAndCacheSticker(id);
        return s.isActive === false ? null : s;
      } catch {
        return null;
      }
    })
  );
  return rows.filter((s): s is StickerDto => s != null);
}

/**
 * Full active catalog in stable sortOrder (no sport query).
 * Callers apply `sortPacksForSport` for game-chat priority.
 */
export async function listStickerPacksCached(opts?: {
  force?: boolean;
}): Promise<StickerPackListItem[]> {
  const now = Date.now();
  if (
    !opts?.force &&
    packListCache &&
    packListCache.key === 'all' &&
    now - packListCache.at < PACK_LIST_TTL_MS
  ) {
    return packListCache.packs;
  }
  if (!opts?.force && packListInflight) return packListInflight;

  if (opts?.force) {
    packListGen += 1;
    packListCache = null;
    packListInflight = null;
  }

  const gen = packListGen;
  const fetchPromise = listStickerPacks()
    .then((packs) => {
      if (gen === packListGen) {
        packListCache = { key: 'all', at: Date.now(), packs };
      }
      return packs;
    })
    .finally(() => {
      if (packListInflight === fetchPromise) packListInflight = null;
    });

  packListInflight = fetchPromise;
  return fetchPromise;
}

export function getCachedPackStickers(packId: string): StickerDto[] | null {
  return packStickersMemory.get(packId) ?? null;
}

export async function fetchAndCachePackStickers(
  packId: string,
  opts?: { force?: boolean }
): Promise<StickerDto[]> {
  if (!opts?.force) {
    const hit = packStickersMemory.get(packId);
    if (hit) return hit;

    const pending = packStickersInflight.get(packId);
    if (pending) return pending;
  } else {
    packStickersGen.set(packId, (packStickersGen.get(packId) ?? 0) + 1);
    packStickersMemory.delete(packId);
    packStickersInflight.delete(packId);
  }

  const gen = packStickersGen.get(packId) ?? 0;
  const promise = getStickerPack(packId)
    .then(({ stickers }) => {
      if ((packStickersGen.get(packId) ?? 0) === gen) {
        putCachedStickers(stickers);
        packStickersMemory.set(packId, stickers);
      }
      return stickers;
    })
    .finally(() => {
      if (packStickersInflight.get(packId) === promise) {
        packStickersInflight.delete(packId);
      }
    });

  packStickersInflight.set(packId, promise);
  return promise;
}
