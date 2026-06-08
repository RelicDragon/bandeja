import type { Game } from '@/types';

export function sortGames(games: Game[]): Game[] {
  return games.sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
  );
}
