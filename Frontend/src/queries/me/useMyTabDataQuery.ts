import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { getMyTabData, clearMyTabCache } from '@/api/me';
import { queryKeys } from '../queryKeys';
import { queryClient } from '../queryClient';

// Extended stale time for My Tab data (2 minutes)
// Socket.IO will invalidate on changes, so we can afford a longer stale time
const MY_TAB_STALE_TIME = 2 * 60 * 1000; // 2 minutes
const MY_TAB_GC_TIME = 10 * 60 * 1000; // 10 minutes

export interface UseMyTabDataOptions {
  includeStories?: boolean;
  includeBooktime?: boolean;
  enabled?: boolean;
}

/**
 * React Query hook for fetching My Tab data.
 *
 * Features:
 * - Extended stale time (2 minutes) for reduced API calls
 * - Automatic fallback to individual endpoints on error
 * - Cache invalidation on socket events
 * - Suspense support for progressive loading
 *
 * @param options - Configuration options
 * @returns My Tab data query result
 */
export function useMyTabDataQuery(options: UseMyTabDataOptions = {}) {
  const user = useAuthStore((state) => state.user);

  const query = useQuery({
    queryKey: queryKeys.me.myTabData(options),
    queryFn: () =>
      getMyTabData({
        userId: user!.id,
        includeStories: options.includeStories,
        includeBooktime: options.includeBooktime,
        useCache: true,
      }),
    enabled: !!user && (options.enabled !== false),
    staleTime: MY_TAB_STALE_TIME,
    gcTime: MY_TAB_GC_TIME,

    // Refetch on window focus is disabled to reduce unnecessary calls
    refetchOnWindowFocus: false,

    // Refetch on reconnect is true for reliability
    refetchOnReconnect: true,

    // Don't refetch on mount if data is fresh
    refetchOnMount: false,

    // Retry configuration
    retry: (failureCount, error: any) => {
      // Don't retry on 4xx errors
      if (error?.response?.status >= 400 && error?.response?.status < 500) {
        return false;
      }
      // Retry up to 2 times on 5xx or network errors
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  return query;
}

/**
 * Hook for prefetching My Tab data.
 * Use this for prefetching on app launch or user hover.
 *
 * @param options - Configuration options
 */
export function usePrefetchMyTabData(options: UseMyTabDataOptions = {}) {
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();

  const prefetch = () => {
    if (!user) return;

    client.prefetchQuery({
      queryKey: queryKeys.me.myTabData(options),
      queryFn: () =>
        getMyTabData({
          userId: user.id,
          includeStories: options.includeStories,
          includeBooktime: options.includeBooktime,
          useCache: true,
        }),
      staleTime: MY_TAB_STALE_TIME,
    });
  };

  return prefetch;
}

/**
 * Invalidate My Tab data cache.
 * Call this after mutations that affect the My Tab.
 */
export function invalidateMyTabData() {
  const queryClient = getQueryClient();
  queryClient.invalidateQueries({
    queryKey: queryKeys.me.myTabData(),
  });
  // Also clear local storage cache
  clearMyTabCache();
}

/**
 * Clear My Tab data from cache.
 * Call this on logout or when data needs to be completely refreshed.
 */
export function clearMyTabData() {
  const queryClient = getQueryClient();
  queryClient.removeQueries({
    queryKey: queryKeys.me.myTabData(),
  });
  clearMyTabCache();
}

// Helper to get query client (for use outside React components)
function getQueryClient() {
  return queryClient;
}
