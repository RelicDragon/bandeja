import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import { gamesApi } from '@/api';
import type { Game } from '@/types';
import { queryKeys } from '../queryKeys';
import { GAMES_LIST_STALE_TIME, PAST_GAMES_PAGE_SIZE } from './constants';
import { filterPastGames } from './filterPastGames';
import { sortGames } from './sortGames';

export interface PastGamesPage {
  games: Game[];
  offset: number;
}

export function pastGamesInfiniteQueryOptions(
  userId: string | undefined,
  enabled = true,
) {
  const isEnabled = enabled && !!userId;

  return infiniteQueryOptions({
    queryKey: queryKeys.games.past(userId ?? ''),
    queryFn: async ({ pageParam }): Promise<PastGamesPage> => {
      const offset = pageParam as number;
      const response = await gamesApi.getPastGames({
        limit: PAST_GAMES_PAGE_SIZE,
        offset,
      });
      const games = filterPastGames(response.data || []);
      return { games, offset };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.games.length < PAST_GAMES_PAGE_SIZE) return undefined;
      return lastPage.offset + PAST_GAMES_PAGE_SIZE;
    },
    staleTime: GAMES_LIST_STALE_TIME,
    enabled: isEnabled,
  });
}

export function flattenPastGamesPages(
  pages: PastGamesPage[] | undefined,
): Game[] {
  if (!pages?.length) return [];
  const seen = new Set<string>();
  const merged: Game[] = [];
  for (const page of pages) {
    for (const game of page.games) {
      if (seen.has(game.id)) continue;
      seen.add(game.id);
      merged.push(game);
    }
  }
  return sortGames(merged);
}

export function usePastGamesQuery(
  userId: string | undefined,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? !!userId;
  return useInfiniteQuery(pastGamesInfiniteQueryOptions(userId, enabled));
}
