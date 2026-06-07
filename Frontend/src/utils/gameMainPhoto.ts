import type { Game } from '@/types';

export function getGameMainPhotoId(
  game: Pick<Game, 'mainPhotoId' | 'mainPhoto'>
): string | null | undefined {
  return game.mainPhoto?.id ?? game.mainPhotoId;
}
