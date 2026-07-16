import { MAX_STICKER_FAVORITES, MAX_STICKER_RECENT } from './stickerConstants';

/** Dedupe preserving first-seen order (MRU-first lists), trim, cap. */
export function normalizeStickerIdList(ids: unknown, max: number): string[] | undefined {
  if (!Array.isArray(ids)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeFavoritesInput(ids: unknown): string[] | undefined {
  return normalizeStickerIdList(ids, MAX_STICKER_FAVORITES);
}

export function normalizeRecentInput(ids: unknown): string[] | undefined {
  return normalizeStickerIdList(ids, MAX_STICKER_RECENT);
}

/** MRU bump: stickerId first, then prior ids, capped. */
export function bumpRecentIdList(
  current: string[] | null | undefined,
  stickerId: string,
  max: number = MAX_STICKER_RECENT
): string[] {
  const id = stickerId.trim();
  if (!id) return [...(current ?? [])].slice(0, max);
  return [id, ...(current ?? []).filter((x) => x !== id)].slice(0, max);
}
