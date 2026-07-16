import type { Sport } from '@prisma/client';

/** Pack fields needed for sport-priority ordering. */
export type StickerPackSortable = {
  sport: Sport | null;
  sortOrder: number;
  isOfficial?: boolean;
  ownerUserId?: string | null;
};

/**
 * Game chat: personal → matching sport → general (null) → other sports.
 * No sport: personal first, then sortOrder.
 */
export function sortStickerPacksForSport<T extends StickerPackSortable>(
  packs: T[],
  sport: Sport | null | undefined
): T[] {
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
