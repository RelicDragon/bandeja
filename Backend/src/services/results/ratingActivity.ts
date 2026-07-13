import { EntityType } from '@prisma/client';

/** Competitive rated games and TRAINING stamp idle clock. BAR / LEAGUE_SEASON / other non-rating do not. */
export function countsAsRatingActivity(game: {
  affectsRating: boolean;
  entityType: EntityType;
}): boolean {
  if (game.entityType === EntityType.BAR || game.entityType === EntityType.LEAGUE_SEASON) {
    return false;
  }
  return game.affectsRating || game.entityType === EntityType.TRAINING;
}
