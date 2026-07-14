import type { Game } from '@/types';
import type { AvailableGamesPage } from './availableGamesPage';
import { EMPTY_AVAILABLE_META } from './availableGamesPage';

export function isAvailableGamesPage(data: unknown): data is AvailableGamesPage {
  return (
    !!data &&
    typeof data === 'object' &&
    Array.isArray((data as AvailableGamesPage).games) &&
    typeof (data as AvailableGamesPage).meta === 'object'
  );
}

export function getGamesFromAvailableCache(data: unknown): Game[] | null {
  if (Array.isArray(data)) return data as Game[];
  if (isAvailableGamesPage(data)) return data.games;
  return null;
}

export function withPatchedAvailableGames(
  data: unknown,
  nextGames: Game[],
): AvailableGamesPage | Game[] {
  if (isAvailableGamesPage(data)) {
    return { ...data, games: nextGames };
  }
  if (Array.isArray(data)) {
    // Migrate legacy array caches to page shape when touched.
    return { games: nextGames, meta: EMPTY_AVAILABLE_META };
  }
  return { games: nextGames, meta: EMPTY_AVAILABLE_META };
}
