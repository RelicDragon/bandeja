import type { GameStorySummary } from '@/api/stories';

/** Story slide / bubble preview: main game photo when set, else game avatar. */
export function getStoryGameBackdropUrl(game: GameStorySummary): string | null {
  if (game.entityType === 'EVENT') {
    const hero = game.eventHeroes?.[0];
    return hero?.thumbnailUrl || hero?.originalUrl || null;
  }
  return game.mainPhoto?.thumbnailUrl ?? game.avatar ?? null;
}
