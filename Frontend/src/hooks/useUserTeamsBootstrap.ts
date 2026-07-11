import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useMyGamesQuery } from '@/queries/games/useMyGamesQuery';
import { hasMyTabMembershipsSnapshot, readMyTabCache } from '@/services/myTabCacheReader';
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
}
