import type { Game } from '@/types';

/** The game's own avatar; a league round borrows its season's. */
export function gameCardAvatarUrl(game: Game): string | null {
  const own = game.avatar?.trim();
  if (own) return own;
  if (game.entityType === 'LEAGUE') return game.parent?.leagueSeason?.game?.avatar?.trim() || null;
  return null;
}
