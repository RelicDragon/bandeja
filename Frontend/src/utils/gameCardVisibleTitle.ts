import type { Game } from '@/types';
import { resolveDisplayedGameText } from '@/utils/gameText/resolveDisplayedGameText';

/** True when the game card title row will render any text for this game. */
export function gameCardHasVisibleTitle(game: Game, locale?: string | null): boolean {
  const displayName = resolveDisplayedGameText(game, { locale }).name;
  // Non-GAME entities always fall back to the entity-type label;
  // GAME shows its game-type label unless it's a plain classic game.
  return Boolean(displayName || game.entityType !== 'GAME' || game.gameType !== 'CLASSIC');
}
