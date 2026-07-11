import { useEffect, useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import {
  flattenPastGamesPages,
  usePastGamesQuery,
} from '@/queries/games/usePastGamesQuery';
import { useMyGamesQuery } from '@/queries/games/useMyGamesQuery';
import { useUnreadStore } from '@/store/unreadStore';
import { pastGameIdsFromMyTabGames } from '@/utils/pastGameIdsFromMyTabGames';

/** Keeps unreadStore myGames/pastGames scope aligned with loaded game lists. */
export function UnreadMyGamesScopeSync() {
  const userId = useAuthStore((s) => s.user?.id);
  const { data: myData } = useMyGamesQuery(userId);
  const { data: pastData } = usePastGamesQuery(userId, { enabled: false });

  const myGameIds = useMemo(
    () => (myData?.games ?? []).map((g) => g.id),
    [myData?.games]
  );
  const pastGameIds = useMemo(() => {
    const cached = flattenPastGamesPages(pastData?.pages);
    if (cached.length > 0) {
      return cached.map((g) => g.id);
    }
    return pastGameIdsFromMyTabGames(myData?.games);
  }, [pastData?.pages, myData?.games]);

  useEffect(() => {
    if (!userId) {
      useUnreadStore.getState().setMyGamesScope([], []);
      return;
    }
    useUnreadStore.getState().setMyGamesScope(myGameIds, pastGameIds);
  }, [userId, myGameIds, pastGameIds]);

  return null;
}
