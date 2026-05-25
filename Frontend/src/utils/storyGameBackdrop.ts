import type { GameStorySummary } from '@/api/stories';

/** Story slide / bubble preview: main game photo when set, else game avatar. */
export function getStoryGameBackdropUrl(game: GameStorySummary): string | null {
  return game.mainPhoto?.thumbnailUrl ?? game.avatar ?? null;
}
