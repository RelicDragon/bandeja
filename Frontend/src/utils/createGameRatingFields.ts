import type { EntityType } from '@/types';

export function resolveCreateGameRatingFields(
  entityType: EntityType,
  levelRange: [number, number],
  affectsRating: boolean,
) {
  if (entityType === 'BAR') {
    return {
      minLevel: null,
      maxLevel: null,
      affectsRating: false,
    };
  }

  return {
    minLevel: levelRange[0],
    maxLevel: levelRange[1],
    affectsRating,
  };
}
