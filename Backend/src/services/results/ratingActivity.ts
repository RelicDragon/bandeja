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

/** Play streak: rated finishes only. BAR / LEAGUE_SEASON / non-rating / training-only never qualify. LEAGUE fixtures do when affectsRating. */
export function countsForPlayStreak(game: {
  affectsRating: boolean;
  entityType: EntityType;
}): boolean {
  if (game.entityType === EntityType.BAR || game.entityType === EntityType.LEAGUE_SEASON) {
    return false;
  }
  return game.affectsRating === true;
}
