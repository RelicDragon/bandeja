import type { Game } from '@/types';

export function userIsOnLeagueScheduleGame(game: Game, userId: string | undefined): boolean {
  if (!userId) return false;
  if (game.participants?.some((p) => p.userId === userId)) return true;
  if (game.fixedTeams?.some((team) => team.players?.some((p) => p.userId === userId))) return true;
  return false;
}
