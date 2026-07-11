import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { clearMyTabCache } from '@/api/me';
import {
  myGamesQueryOptions,
  useMyGamesQuery,
} from '@/queries/games/useMyGamesQuery';
import { queryClient } from '../queryClient';
import { queryKeys } from '../queryKeys';

export interface UseMyTabDataOptions {
  includeStories?: boolean;
  includeBooktime?: boolean;
  enabled?: boolean;
}

/**
 * My Tab data via the canonical `games.my` query cache (single network path).
 */
export function useMyTabDataQuery(options: UseMyTabDataOptions = {}) {
  const userId = useAuthStore((state) => state.user?.id);
  const enabled = options.enabled !== false && !!userId;
  return useMyGamesQuery(userId, { enabled });
}

/**
 * Prefetch my-tab data into the shared `games.my` cache.
 */
export function usePrefetchMyTabData(_options: UseMyTabDataOptions = {}) {
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();

  return () => {
    if (!user?.id) return;
    void client.prefetchQuery(myGamesQueryOptions(user.id));
  };
}

function resolveMyTabUserId(userId?: string): string | undefined {
  return userId ?? useAuthStore.getState().user?.id;
}

export function invalidateMyTabData(userId?: string): void {
  const resolvedUserId = resolveMyTabUserId(userId);
  clearMyTabCache(resolvedUserId);
  if (resolvedUserId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.games.my(resolvedUserId) });
    return;
  }
  void queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
}

export function clearMyTabData(userId?: string): void {
  const resolvedUserId = resolveMyTabUserId(userId);
  clearMyTabCache(resolvedUserId);
  if (resolvedUserId) {
    queryClient.removeQueries({ queryKey: queryKeys.games.my(resolvedUserId) });
  }
}
