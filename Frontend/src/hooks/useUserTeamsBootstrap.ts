import { useEffect, useRef } from 'react';
import { matchQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useMyGamesQuery } from '@/queries/games/useMyGamesQuery';
import { queryKeys } from '@/queries/queryKeys';
import {
  hasMyTabMembershipsSnapshot,
  readMyTabCache,
  type MyTabCacheSnapshot,
} from '@/services/myTabCacheReader';
import { useUserTeamsStore } from '@/store/userTeamsStore';

/**
 * Single bootstrap path for user teams on home — hydrates from my-tab cache or fetches once.
 */
export function useUserTeamsBootstrap() {
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const refreshAll = useUserTeamsStore((s) => s.refreshAll);
  const hydrateFromMyTabCache = useUserTeamsStore((s) => s.hydrateFromMyTabCache);
  const bootstrappedUserRef = useRef<string | null>(null);
  const { isPending: myTabPending } = useMyGamesQuery(userId, { enabled: !!userId });

  useEffect(() => {
    if (!userId || bootstrappedUserRef.current === userId) return;
    if (myTabPending) return;

    bootstrappedUserRef.current = userId;

    const cached = readMyTabCache(queryClient, userId);
    if (cached?.teams && cached.memberships !== null) {
      hydrateFromMyTabCache(queryClient, userId);
    }
    if (hasMyTabMembershipsSnapshot(cached)) {
      return;
    }
    void refreshAll();
  }, [userId, myTabPending, queryClient, hydrateFromMyTabCache, refreshAll]);

  // Team socket events are missed while the app is backgrounded, so follow every
  // server fetch of My tab (resume, pull-to-refresh). Manual `setQueryData` patches
  // are skipped: they can carry teams older than store-only writes.
  useEffect(() => {
    if (!userId) return;
    const myTabFilter = { queryKey: queryKeys.games.my(userId) };
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success' || event.action.manual) return;
      if (!matchQuery(myTabFilter, event.query)) return;
      useUserTeamsStore
        .getState()
        .syncFromMyTabData(event.query.state.data as MyTabCacheSnapshot | undefined, userId);
    });
  }, [userId, queryClient]);
}
