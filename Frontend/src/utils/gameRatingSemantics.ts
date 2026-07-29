import type { Game } from '@/types';

export function gameIsNonRating(
  game: Pick<Game, 'entityType' | 'affectsRating'>,
): boolean {
  return game.entityType === 'BAR' || !game.affectsRating;
}

export function gameShowsLevelBand(
  game: Pick<Game, 'entityType' | 'minLevel' | 'maxLevel'>,
): boolean {
  return (
    game.entityType !== 'BAR' &&
    typeof game.minLevel === 'number' &&
    typeof game.maxLevel === 'number'
  );
}
