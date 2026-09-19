import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Invite } from '@/types';
import { clearMyTabCache } from '@/api/me';
import {
  useMyGamesQuery,
  type MyGamesData,
} from '@/queries/games/useMyGamesQuery';
import { queryKeys } from '@/queries/queryKeys';
import { filterInboxVisibleInvites } from '@/utils/gameInviteInbox';
import { excludePendingInviteOnlyMyGames } from '@/utils/excludePendingInviteOnlyMyGames';
import { excludeUnoptedEventsFromMyGames } from '@/utils/eventMyTabMembership';

const EMPTY_UNREAD_COUNTS: Record<string, number> = {};
const EMPTY_INVITES: Invite[] = [];

export const useMyGames = (
  user: { id?: string } | null | undefined,
  onLoading: (loading: boolean) => void,
) => {
  const userId = user?.id;
  const queryClient = useQueryClient();
  const { data, isPending, refetch } = useMyGamesQuery(userId);
  const onLoadingRef = useRef(onLoading);
  onLoadingRef.current = onLoading;

  const games = useMemo(
    () => excludeUnoptedEventsFromMyGames(
      excludePendingInviteOnlyMyGames(data?.games ?? [], userId),
      userId,
    ),
    [data?.games, userId],
  );
  // Memoised so the invites list keeps its identity across the tab's unrelated
  // re-renders and `InvitesSection` can skip them.
  const invites = useMemo(
    () => filterInboxVisibleInvites<Invite>(data?.invites ?? EMPTY_INVITES),
    [data?.invites],
  );
  const unreadCounts = data?.unreadCounts ?? EMPTY_UNREAD_COUNTS;

  const setInvites = useCallback(
    (newInvites: Invite[] | ((prev: Invite[]) => Invite[])) => {
      if (!userId) return;
      queryClient.setQueryData<MyGamesData>(
        queryKeys.games.my(userId),
        (old: MyGamesData | undefined) => {
          const prevInvites = old?.invites ?? [];
          const nextInvites =
            typeof newInvites === 'function' ? newInvites(prevInvites) : newInvites;
          if (!old) return { games: [], invites: nextInvites, unreadCounts: {} };
          return { ...old, invites: nextInvites };
        },
      );
    },
    [userId, queryClient],
  );

  useEffect(() => {
    if (!userId) {
      onLoadingRef.current(false);
      return;
    }
    onLoadingRef.current(isPending);
  }, [isPending, userId]);

  const fetchData = useCallback(
    async (_showLoader = true, _force = false) => {
      if (!userId) return;
      if (_force) {
        clearMyTabCache(userId);
        await queryClient.invalidateQueries({ queryKey: queryKeys.games.my(userId) });
      }
      await refetch();
    },
    [userId, queryClient, refetch],
  );

  return {
    games,
    invites,
    unreadCounts,
    fetchData,
    setInvites,
    isLoading: isPending,
    refetch: fetchData,
  };
};
