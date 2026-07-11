import { startOfDay } from 'date-fns';
import type { Game } from '@/types';
import { filterPastGames } from '@/queries/games/filterPastGames';

export function filterPastGamesForCalendarRange(
  games: Game[],
  rangeStart: Date,
  rangeEnd: Date,
): Game[] {
  const startMs = startOfDay(rangeStart).getTime();
  const endMs = startOfDay(rangeEnd).getTime() + 24 * 60 * 60 * 1000 - 1;

  return filterPastGames(
    games.filter((game) => {
      const startMsGame = new Date(game.startTime).getTime();
      return startMsGame >= startMs && startMsGame <= endMs;
    }),
  );
}

export function pastGamesCacheCoversRange(
  games: Game[],
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  if (games.length === 0) return false;

  const startMs = startOfDay(rangeStart).getTime();
  const endMs = startOfDay(rangeEnd).getTime() + 24 * 60 * 60 * 1000 - 1;

  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;
  for (const game of games) {
    const ms = new Date(game.startTime).getTime();
    if (ms < minMs) minMs = ms;
    if (ms > maxMs) maxMs = ms;
  }

  return minMs <= startMs && maxMs >= endMs;
}
