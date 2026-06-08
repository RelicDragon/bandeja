import { useCallback, useEffect } from 'react';
import type { InfiniteData } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { gamesApi } from '@/api';
import type { Game } from '@/types';
import {
  flattenPastGamesPages,
  usePastGamesQuery,
  type PastGamesPage,
} from '@/queries/games';
import { sortGames } from '@/queries/games/sortGames';
import { queryKeys } from '@/queries/queryKeys';

export const usePastGames = (
  user: { id?: string } | null | undefined,
  shouldLoad = false,
) => {
  const userId = user?.id;
  const queryClient = useQueryClient();
  const {
    data,
    isPending,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = usePastGamesQuery(userId, { enabled: shouldLoad });

  const pastGames = flattenPastGamesPages(data?.pages);
  const loadingPastGames = isPending || isFetchingNextPage || (isFetching && pastGames.length === 0);
  const hasMorePastGames = hasNextPage ?? false;

  useEffect(() => {
    if (shouldLoad && pastGames.length === 0 && !loadingPastGames && userId) {
      void fetchNextPage();
    }
  }, [shouldLoad, pastGames.length, loadingPastGames, userId, fetchNextPage]);

  const loadPastGames = useCallback(async () => {
    if (!userId || isFetchingNextPage || !hasMorePastGames) return;
    await fetchNextPage();
  }, [userId, isFetchingNextPage, hasMorePastGames, fetchNextPage]);

  const refetchGame = useCallback(
    async (gameId: string) => {
      if (!userId) return;
      try {
        const response = await gamesApi.getById(gameId);
        const updatedGame = response.data as Game;
        queryClient.setQueryData<InfiniteData<PastGamesPage>>(
          queryKeys.games.past(userId),
          (old) => {
            if (!old) return old;
            const exists = old.pages.some((page) =>
              page.games.some((g) => g.id === gameId),
            );
            if (!exists) return old;
            if (
              updatedGame.entityType === 'LEAGUE_SEASON' &&
              updatedGame.resultsStatus !== 'FINAL'
            ) {
              return {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  games: page.games.filter((g) => g.id !== gameId),
                })),
              };
            }
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                games: sortGames(
                  page.games.map((g) => (g.id === gameId ? updatedGame : g)),
                ),
              })),
            };
          },
        );
      } catch {
        // ignore
      }
    },
    [userId, queryClient],
  );

  return {
    pastGames,
    loadingPastGames,
    hasMorePastGames,
    loadPastGames,
    refetchGame,
  };
};
