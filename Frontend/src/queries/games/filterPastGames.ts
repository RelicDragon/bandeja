import type { Game } from '@/types';

export function filterPastGames(games: Game[]): Game[] {
  return games.filter(
    (g) => !(g.entityType === 'LEAGUE_SEASON' && g.resultsStatus !== 'FINAL'),
  );
}
