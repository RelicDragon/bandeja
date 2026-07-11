import type { Game } from '@/types';

/** True when the game card title row will render any text for this game. */
export function gameCardHasVisibleTitle(game: Game): boolean {
  // Non-GAME entities always fall back to the entity-type label;
  // GAME shows its game-type label unless it's a plain classic game.
  return Boolean(game.name || game.entityType !== 'GAME' || game.gameType !== 'CLASSIC');
}
