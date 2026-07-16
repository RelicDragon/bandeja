import type { Sport } from '@shared/sport';
import type { StickerDto, StickerPackListItem } from '@/api/stickers';

/**
 * Game chat: personal → matching sport → general (null) → other sports.
 * Non-game / no sport: personal first, then catalog order (sortOrder).
 */
export function sortPacksForSport(
  packs: StickerPackListItem[],
  sport: Sport | null | undefined
): StickerPackListItem[] {
  return [...packs].sort((a, b) => {
    const aPersonal = a.isOfficial === false || !!a.ownerUserId ? 0 : 1;
    const bPersonal = b.isOfficial === false || !!b.ownerUserId ? 0 : 1;
    if (aPersonal !== bPersonal) return aPersonal - bPersonal;
    if (!sport) return a.sortOrder - b.sortOrder;
    const aRank = a.sport === sport ? 0 : a.sport == null ? 1 : 2;
    const bRank = b.sport === sport ? 0 : b.sport == null ? 1 : 2;
    if (aRank !== bRank) return aRank - bRank;
    return a.sortOrder - b.sortOrder;
  });
}

export function stickerMatchesQuery(
  sticker: Pick<StickerDto, 'emoji' | 'title' | 'slug'>,
  rawQuery: string
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const title = (sticker.title ?? '').toLowerCase();
  const emoji = sticker.emoji ?? '';
  const slug = (sticker.slug ?? '').toLowerCase();
  return title.includes(q) || emoji.includes(rawQuery.trim()) || slug.includes(q);
}

/** Deduped filter over a local catalog index (emoji / title / slug). */
export function filterStickersByQuery(
  stickers: StickerDto[],
  rawQuery: string
): StickerDto[] {
  const q = rawQuery.trim();
  if (!q) return [];
  const seen = new Set<string>();
  const out: StickerDto[] = [];
  for (const s of stickers) {
    if (seen.has(s.id) || !stickerMatchesQuery(s, q)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}
