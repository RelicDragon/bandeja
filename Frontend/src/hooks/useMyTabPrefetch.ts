import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { myGamesQueryOptions } from '@/queries/games/useMyGamesQuery';
import { pastGamesInfiniteQueryOptions } from '@/queries/games/usePastGamesQuery';

/**
 * Prefetches my-tab-data (games, invites, stories count, booktime) on app launch,
 * past games only on the past-games sub-tab, and on navigation intent / tab activation.
 */
export function useMyTabPrefetch(opts?: { enabled?: boolean; prefetchPastGames?: boolean }) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const canPrefetch = opts?.enabled !== false && !isInitializing && isAuthenticated && !!user;
  const shouldPrefetchPastGames = opts?.prefetchPastGames === true;

  const hasPrefetchedCore = useRef(false);
  const hasPrefetchedPastGames = useRef(false);
  const isPrefetching = useRef(false);

  const prefetchCoreData = useCallback(() => {
    if (!canPrefetch || !user || hasPrefetchedCore.current || isPrefetching.current) return;

    isPrefetching.current = true;
    hasPrefetchedCore.current = true;

    queryClient.prefetchQuery(myGamesQueryOptions(user.id)).finally(() => {
      isPrefetching.current = false;
    });
  }, [canPrefetch, user, queryClient]);

  const prefetchPastGamesData = useCallback(() => {
    if (!canPrefetch || !user || hasPrefetchedPastGames.current) return;

    hasPrefetchedPastGames.current = true;
    void queryClient.prefetchInfiniteQuery({
      ...pastGamesInfiniteQueryOptions(user.id),
      staleTime: 60 * 1000,
      pages: 1,
    });
  }, [canPrefetch, user, queryClient]);

  const prefetchOnIntent = useCallback(() => {
    prefetchCoreData();
    if (shouldPrefetchPastGames) {
      prefetchPastGamesData();
    }
  }, [prefetchCoreData, prefetchPastGamesData, shouldPrefetchPastGames]);

  const prefetchOnActivate = useCallback(() => {
    prefetchCoreData();
    if (shouldPrefetchPastGames) {
      prefetchPastGamesData();
    }
  }, [prefetchCoreData, prefetchPastGamesData, shouldPrefetchPastGames]);

  useEffect(() => {
    if (!canPrefetch || !user) return;
    prefetchCoreData();
    if (shouldPrefetchPastGames) {
      prefetchPastGamesData();
    }
  }, [canPrefetch, user, prefetchCoreData, prefetchPastGamesData, shouldPrefetchPastGames]);

  return {
    prefetchOnIntent,
    prefetchOnActivate,
    prefetchCoreData,
    prefetchPastGamesData,
  };
}

/**
 * Hook for prefetching past games data
 * Past games are only loaded when the user switches to the past games tab
 */
export function usePastGamesPrefetch() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitializing = useAuthStore((state) => state.isInitializing);

  const prefetchPastGames = useCallback(() => {
    if (isInitializing || !isAuthenticated || !user) return;

    queryClient.prefetchInfiniteQuery({
      ...pastGamesInfiniteQueryOptions(user.id),
      staleTime: 60 * 1000,
      pages: 1,
    });
  }, [isInitializing, isAuthenticated, user, queryClient]);

  return { prefetchPastGames };
}
