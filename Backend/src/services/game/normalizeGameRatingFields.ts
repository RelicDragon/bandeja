import { EntityType } from '@prisma/client';

type GameRatingFieldsInput = {
  entityType: EntityType;
  minLevel?: number | null;
  maxLevel?: number | null;
  affectsRating?: boolean;
};

export function normalizeGameRatingFields(input: GameRatingFieldsInput) {
  if (input.entityType === EntityType.BAR) {
    return {
      minLevel: null,
      maxLevel: null,
      affectsRating: false,
    };
  }

  return {
    minLevel: input.minLevel ?? null,
    maxLevel: input.maxLevel ?? null,
    affectsRating: input.affectsRating ?? true,
  };
}
