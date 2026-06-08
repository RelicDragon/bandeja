import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Invite } from '@/types';
import {
  useMyGamesQuery,
  type MyGamesData,
} from '@/queries/games/useMyGamesQuery';
import { queryKeys } from '@/queries/queryKeys';

type SkeletonAnimation = {
  showSkeletonsAnimated: () => void;
  hideSkeletonsAnimated: () => void;
};

export const useMyGames = (
  user: { id?: string } | null | undefined,
  onLoading: (loading: boolean) => void,
  skeletonAnimation?: SkeletonAnimation,
) => {
  const userId = user?.id;
  const queryClient = useQueryClient();
  const { data, isPending, refetch } = useMyGamesQuery(userId);
  const initialLoadDoneRef = useRef(false);
  const onLoadingRef = useRef(onLoading);
  onLoadingRef.current = onLoading;
  const showSkeletonsRef = useRef(skeletonAnimation?.showSkeletonsAnimated);
  showSkeletonsRef.current = skeletonAnimation?.showSkeletonsAnimated;
  const hideSkeletonsRef = useRef(skeletonAnimation?.hideSkeletonsAnimated);
  hideSkeletonsRef.current = skeletonAnimation?.hideSkeletonsAnimated;

  const games = data?.games ?? [];
  const invites = data?.invites ?? [];

  const setInvites = useCallback(
    (newInvites: Invite[]) => {
      if (!userId) return;
      queryClient.setQueryData<MyGamesData>(
        queryKeys.games.my(userId),
        (old) => {
          if (!old) return { games: [], invites: newInvites };
          return { ...old, invites: newInvites };
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
    if (isPending && !initialLoadDoneRef.current) {
      showSkeletonsRef.current?.();
      onLoadingRef.current(true);
      return;
    }
    if (!isPending) {
      if (!initialLoadDoneRef.current) {
        hideSkeletonsRef.current?.();
        initialLoadDoneRef.current = true;
      }
      onLoadingRef.current(false);
    }
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
    fetchData,
    setInvites,
    isLoading: isPending,
    refetch: fetchData,
  };
};
