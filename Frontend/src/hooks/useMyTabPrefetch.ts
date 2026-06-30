import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from '@/queries/queryKeys';
import { getMyTabData } from '@/api/me';
import { myGamesQueryOptions } from '@/queries/games/useMyGamesQuery';
import { pastGamesInfiniteQueryOptions } from '@/queries/games/usePastGamesQuery';

/**
 * My Tab Prefetch Hook
 *
 * Implements multi-stage prefetching strategy:
 * 1. App launch - prefetch critical data (games, invites)
 * 2. Idle time - prefetch nice-to-have data (teams, stories)
 * 3. Navigation hover - prefetch if available
 * 4. Tab activation - prefetch all data
 *
 * Uses requestIdleCallback when available for non-blocking prefetching.
 */
export function useMyTabPrefetch(opts?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const canPrefetch = opts?.enabled !== false && !isInitializing && isAuthenticated && !!user;

  // Track prefetch state to avoid duplicate calls
  const hasPrefetchedCore = useRef(false);
  const hasPrefetchedExtras = useRef(false);
  const isPrefetching = useRef(false);

  /**
   * Prefetch core data (games, invites)
   * Should be called immediately on app launch
   */
  const prefetchCoreData = useCallback(() => {
    if (!canPrefetch || !user || hasPrefetchedCore.current || isPrefetching.current) return;

    isPrefetching.current = true;
    hasPrefetchedCore.current = true;

    queryClient.prefetchQuery({
      ...myGamesQueryOptions(user.id),
      staleTime: 2 * 60 * 1000, // 2 minutes
    }).finally(() => {
      isPrefetching.current = false;
    });
  }, [canPrefetch, user, queryClient]);

  /**
   * Prefetch extra data (teams, stories)
   * Should be called during idle time
   */
  const prefetchExtras = useCallback(() => {
    if (!canPrefetch || !user || hasPrefetchedExtras.current) return;

    hasPrefetchedExtras.current = true;

    queryClient.prefetchQuery({
      queryKey: queryKeys.me.myTabData({ includeStories: true, includeBooktime: true }),
      queryFn: () => getMyTabData({ includeStories: true, includeBooktime: true, useCache: true }),
      staleTime: 5 * 60 * 1000, // 5 minutes
    });
  }, [canPrefetch, user, queryClient]);

  /**
   * Prefetch on navigation intent (hover/touch)
   * Call this when user shows intent to navigate to My Tab
   */
  const prefetchOnIntent = useCallback(() => {
    prefetchCoreData();
  }, [prefetchCoreData]);

  /**
   * Prefetch on tab activation
   * Call this when My Tab is about to become visible
   */
  const prefetchOnActivate = useCallback(() => {
    prefetchCoreData();

    // Also prefetch extras during idle time after activation
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(
        () => {
          prefetchExtras();
        },
        { timeout: 2000 } // Fallback after 2s if idle never fires
      );
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(() => {
        prefetchExtras();
      }, 100);
    }
  }, [prefetchCoreData, prefetchExtras]);

  // Prefetch core data on mount (app launch)
  useEffect(() => {
    if (!canPrefetch || !user) return;

    // Immediate prefetch of core data
    prefetchCoreData();

    // Prefetch extras during idle time
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(
        () => {
          prefetchExtras();
        },
        { timeout: 2000 } // Fallback after 2s
      );
    } else {
      // Fallback for browsers without requestIdleCallback
      const timer = setTimeout(() => {
        prefetchExtras();
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [canPrefetch, user, prefetchCoreData, prefetchExtras]);

  return {
    prefetchOnIntent,
    prefetchOnActivate,
    prefetchCoreData,
    prefetchExtras,
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
      staleTime: 60 * 1000, // 1 minute
      pages: 1,
    });
  }, [isInitializing, isAuthenticated, user, queryClient]);

  return { prefetchPastGames };
}
