import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Invite } from '@/types';
import {
  useMyGamesQuery,
  type MyGamesData,
} from '@/queries/games/useMyGamesQuery';
import { queryKeys } from '@/queries/queryKeys';

export const useMyGames = (
  user: { id?: string } | null | undefined,
  onLoading: (loading: boolean) => void,
) => {
  const userId = user?.id;
  const queryClient = useQueryClient();
  const { data, isPending, refetch } = useMyGamesQuery(userId);
  const onLoadingRef = useRef(onLoading);
  onLoadingRef.current = onLoading;

  const games = data?.games ?? [];
  const invites = data?.invites ?? [];
  const unreadCounts = data?.unreadCounts ?? {};

  const setInvites = useCallback(
    (newInvites: Invite[] | ((prev: Invite[]) => Invite[])) => {
      if (!userId) return;
      queryClient.setQueryData<MyGamesData>(
        queryKeys.games.my(userId),
        (old) => {
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
