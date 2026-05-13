import type { Game } from '@/types';

export function isStalePastScheduledGame(game: Game): boolean {
  if (game.entityType === 'LEAGUE_SEASON') return false;
  if (game.timeIsSet === false) return false;
  if (new Date(game.startTime).getTime() >= Date.now()) return false;
  if (game.status === 'ANNOUNCED') return true;
  if (game.status === 'STARTED' && game.entityType !== 'LEAGUE_SEASON') return true;
  return false;
}
