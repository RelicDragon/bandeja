import { format, startOfDay } from 'date-fns';
import type { Game } from '@/types';
import { filterPastGames } from '@/queries/games/filterPastGames';
import { dateKeyInTimezone } from '@/utils/weatherDayGroups';
import { resolveViewerCityTimezone } from '@/utils/cityTimezone';

function rangeDayKeys(
  rangeStart: Date,
  rangeEnd: Date,
): { startKey: string; endKey: string } {
  return {
    startKey: format(startOfDay(rangeStart), 'yyyy-MM-dd'),
    endKey: format(startOfDay(rangeEnd), 'yyyy-MM-dd'),
  };
}

function gameDayKey(game: Game, cityTimezone: string): string {
  return dateKeyInTimezone(new Date(game.startTime), cityTimezone);
}

export function filterPastGamesForCalendarRange(
  games: Game[],
  rangeStart: Date,
  rangeEnd: Date,
  cityTimezone?: string | null,
): Game[] {
  const tz = resolveViewerCityTimezone(cityTimezone);
  const { startKey, endKey } = rangeDayKeys(rangeStart, rangeEnd);

  return filterPastGames(
    games.filter((game) => {
      const key = gameDayKey(game, tz);
      return key >= startKey && key <= endKey;
    }),
  );
}

export function pastGamesCacheCoversRange(
  games: Game[],
  rangeStart: Date,
  rangeEnd: Date,
  cityTimezone?: string | null,
): boolean {
  if (games.length === 0) return false;

  const tz = resolveViewerCityTimezone(cityTimezone);
  const { startKey, endKey } = rangeDayKeys(rangeStart, rangeEnd);

  let minKey = '9999-99-99';
  let maxKey = '0000-00-00';
  for (const game of games) {
    const key = gameDayKey(game, tz);
    if (key < minKey) minKey = key;
    if (key > maxKey) maxKey = key;
  }

  return minKey <= startKey && maxKey >= endKey;
}
