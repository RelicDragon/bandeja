import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useMyGamesQuery } from '@/queries/games/useMyGamesQuery';
import { useHeaderStore } from '@/store/headerStore';
import { countPendingInvites } from '@/services/myTabCacheReader';
import { headerService } from '@/services/headerService';

/**
 * Keeps the header invite badge in sync with my-tab query cache.
 * Falls back to network fetch when cache is empty after my-tab settles.
 */
export function useHeaderInvitesHydration() {
  const userId = useAuthStore((s) => s.user?.id);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const queryClient = useQueryClient();
  const { data, isFetched, isError } = useMyGamesQuery(userId, {
    enabled: isAuthenticated && !isInitializing && !!userId,
  });

  useEffect(() => {
    if (!isAuthenticated || isInitializing || !userId) return;
    headerService.hydratePendingInvitesFromCache();
  }, [isAuthenticated, isInitializing, userId, queryClient]);

  useEffect(() => {
    if (!isFetched || !userId) return;

    if (data != null && Array.isArray(data.invites)) {
      const count = countPendingInvites(data.invites);
      const { pendingInvites, setPendingInvitesFromServer } = useHeaderStore.getState();
      if (pendingInvites !== count) {
        setPendingInvitesFromServer(count);
      }
      return;
    }

    if (headerService.hydratePendingInvitesFromCache()) return;

    if (isError && navigator.onLine) {
      headerService.fetchPendingInvites();
    }
  }, [isFetched, isError, userId, data]);
}
