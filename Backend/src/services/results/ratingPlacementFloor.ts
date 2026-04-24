import { EntityType, Prisma } from '@prisma/client';

const PLACEMENT_FLOOR_MAX_RANK: Partial<Record<EntityType, number>> = {
  [EntityType.GAME]: 1,
  [EntityType.LEAGUE]: 1,
  [EntityType.LEAGUE_SEASON]: 1,
  [EntityType.TOURNAMENT]: 3,
};

export function maxInclusiveRankForNegativeRatingFloor(entityType: EntityType): number | null {
  const max = PLACEMENT_FLOOR_MAX_RANK[entityType];
  return max ?? null;
}

export function isPlacementProtectedFromNegativeRating(
  entityType: EntityType,
  position: number | null | undefined,
  affectsRating: boolean
): boolean {
  if (!affectsRating) return false;
  const maxRank = maxInclusiveRankForNegativeRatingFloor(entityType);
  if (maxRank == null) return false;
  if (position == null || !Number.isFinite(position)) return false;
  return position >= 1 && position <= maxRank;
}

export function mergePlacementRatingFloorMetadata(
  existing: Prisma.JsonValue | null | undefined,
  uncappedLevelChange: number | undefined
): Prisma.InputJsonValue {
  const base: Record<string, unknown> =
    existing !== null &&
    existing !== undefined &&
    typeof existing === 'object' &&
    !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};

  if (uncappedLevelChange === undefined) {
    delete base.placementRatingFloor;
  } else {
    base.placementRatingFloor = { uncappedLevelChange };
  }

  return base as Prisma.InputJsonValue;
}
