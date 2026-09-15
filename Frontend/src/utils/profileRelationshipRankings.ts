import type { PerformanceRelationshipEntry, UserPerformanceInsights } from '@/api/users';

export type RelationshipRankingMode = 'formulae' | 'rating' | 'games';
export type RelationshipCardKey = 'bestPartner' | 'worstPartner' | 'favoriteTarget' | 'nemesis';
export type RelationshipPlaceIndex = 0 | 1 | 2;

export type RelationshipSource = UserPerformanceInsights['relationships'];

export type RankedRelationships = {
  bestPartner: PerformanceRelationshipEntry[];
  worstPartner: PerformanceRelationshipEntry[];
  favoriteTarget: PerformanceRelationshipEntry[];
  nemesis: PerformanceRelationshipEntry[];
};

const ALT_RANKING_MODES = ['rating', 'games'] as const satisfies ReadonlyArray<RelationshipRankingMode>;

function asRanks(value: unknown): PerformanceRelationshipEntry[] {
  return Array.isArray(value) ? value : [];
}

function ranksOrFallback(
  primary: PerformanceRelationshipEntry[] | undefined,
  fallback: PerformanceRelationshipEntry[] | undefined,
): PerformanceRelationshipEntry[] {
  const ranks = asRanks(primary);
  return ranks.length > 0 ? ranks : asRanks(fallback);
}

export function firstRankedEntry(
  entries: PerformanceRelationshipEntry[] | undefined,
): PerformanceRelationshipEntry | null {
  return entries?.[0] ?? null;
}

function entryUserId(entry: PerformanceRelationshipEntry | null | undefined): string | null {
  return entry?.user?.id ?? null;
}

export function resolveRelationshipsForMode(
  source: RelationshipSource,
  mode: RelationshipRankingMode,
): RankedRelationships {
  switch (mode) {
    case 'rating':
      return {
        bestPartner: ranksOrFallback(source.bestPartnerByRating, source.bestPartner),
        worstPartner: ranksOrFallback(source.worstPartnerByRating, source.worstPartner),
        favoriteTarget: ranksOrFallback(source.favoriteTargetByRating, source.favoriteTarget),
        nemesis: ranksOrFallback(source.nemesisByRating, source.nemesis),
      };
    case 'games':
      return {
        bestPartner: ranksOrFallback(source.bestPartnerByCount, source.bestPartner),
        worstPartner: ranksOrFallback(source.worstPartnerByCount, source.worstPartner),
        favoriteTarget: ranksOrFallback(source.favoriteTargetByCount, source.favoriteTarget),
        nemesis: ranksOrFallback(source.nemesisByCount, source.nemesis),
      };
    case 'formulae':
    default:
      return {
        bestPartner: asRanks(source.bestPartner),
        worstPartner: asRanks(source.worstPartner),
        favoriteTarget: asRanks(source.favoriteTarget),
        nemesis: asRanks(source.nemesis),
      };
  }
}

/** Stable id tuple for “would the cards look the same?” */
export function rankingFingerprint(resolved: RankedRelationships): string {
  return [
    entryUserId(firstRankedEntry(resolved.bestPartner)),
    entryUserId(firstRankedEntry(resolved.worstPartner)),
    entryUserId(firstRankedEntry(resolved.favoriteTarget)),
    entryUserId(firstRankedEntry(resolved.nemesis)),
  ].join('\0');
}

/**
 * Formulae first, then Rating/Games only when their effective people set
 * is new vs every mode already kept (no duplicate no-op tabs).
 */
export function distinctRelationshipRankingModes(
  source: RelationshipSource,
): RelationshipRankingMode[] {
  const modes: RelationshipRankingMode[] = ['formulae'];
  const seen = new Set([rankingFingerprint(resolveRelationshipsForMode(source, 'formulae'))]);

  for (const mode of ALT_RANKING_MODES) {
    const fp = rankingFingerprint(resolveRelationshipsForMode(source, mode));
    if (seen.has(fp)) continue;
    seen.add(fp);
    modes.push(mode);
  }

  return modes;
}

/** Drop worst/nemesis when they point at the same person as best/favorite. */
export function dedupeRelationshipCards<
  T extends { key: RelationshipCardKey; entry: PerformanceRelationshipEntry | null | undefined },
>(cards: ReadonlyArray<T>): T[] {
  let bestId: string | null = null;
  let favoriteId: string | null = null;
  for (const card of cards) {
    if (card.key === 'bestPartner') bestId = entryUserId(card.entry);
    if (card.key === 'favoriteTarget') favoriteId = entryUserId(card.entry);
  }

  return cards.filter((card) => {
    const id = entryUserId(card.entry);
    if (!id) return false;
    if (card.key === 'worstPartner' && bestId === id) return false;
    if (card.key === 'nemesis' && favoriteId === id) return false;
    return true;
  });
}

export function clampRelationshipPlaceIndex(
  ranks: PerformanceRelationshipEntry[],
  placeIndex: number,
): RelationshipPlaceIndex {
  if (ranks.length <= 1 || placeIndex <= 0) return 0;
  if (placeIndex >= 2 && ranks.length > 2) return 2;
  return 1;
}
