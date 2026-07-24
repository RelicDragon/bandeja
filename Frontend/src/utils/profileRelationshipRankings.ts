import type { PerformanceRelationshipEntry, UserPerformanceInsights } from '@/api/users';

export type RelationshipRankingMode = 'formulae' | 'rating' | 'games';
export type RelationshipCardKey = 'bestPartner' | 'worstPartner' | 'favoriteTarget' | 'nemesis';

export type RelationshipSource = UserPerformanceInsights['relationships'];

export type ResolvedRelationships = {
  bestPartner: PerformanceRelationshipEntry | null | undefined;
  worstPartner: PerformanceRelationshipEntry | null | undefined;
  favoriteTarget: PerformanceRelationshipEntry | null | undefined;
  nemesis: PerformanceRelationshipEntry | null | undefined;
};

const ALT_RANKING_MODES = ['rating', 'games'] as const satisfies ReadonlyArray<RelationshipRankingMode>;

function entryUserId(entry: PerformanceRelationshipEntry | null | undefined): string | null {
  return entry?.user?.id ?? null;
}

export function resolveRelationshipsForMode(
  source: RelationshipSource,
  mode: RelationshipRankingMode,
): ResolvedRelationships {
  switch (mode) {
    case 'rating':
      return {
        bestPartner: source.bestPartnerByRating ?? source.bestPartner,
        worstPartner: source.worstPartnerByRating ?? source.worstPartner,
        favoriteTarget: source.favoriteTargetByRating ?? source.favoriteTarget,
        nemesis: source.nemesisByRating ?? source.nemesis,
      };
    case 'games':
      return {
        bestPartner: source.bestPartnerByCount ?? source.bestPartner,
        worstPartner: source.worstPartnerByCount ?? source.worstPartner,
        favoriteTarget: source.favoriteTargetByCount ?? source.favoriteTarget,
        nemesis: source.nemesisByCount ?? source.nemesis,
      };
    case 'formulae':
    default:
      return {
        bestPartner: source.bestPartner,
        worstPartner: source.worstPartner,
        favoriteTarget: source.favoriteTarget,
        nemesis: source.nemesis,
      };
  }
}

/** Stable id tuple for “would the cards look the same?” */
export function rankingFingerprint(resolved: ResolvedRelationships): string {
  return [
    entryUserId(resolved.bestPartner),
    entryUserId(resolved.worstPartner),
    entryUserId(resolved.favoriteTarget),
    entryUserId(resolved.nemesis),
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
