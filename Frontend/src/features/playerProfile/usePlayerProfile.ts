import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { UserStats } from '@/api/users';
import { usersApi } from '@/api/users';
import { favoritesApi } from '@/api/favorites';
import { blockedUsersApi } from '@/api/blockedUsers';
import { useAuthStore } from '@/store/authStore';
import { useFavoritesStore } from '@/store/favoritesStore';
import { usePlayersStore } from '@/store/playersStore';
import { usePresenceStore } from '@/store/presenceStore';
import { usePresenceSubscription } from '@/hooks/usePresenceSubscription';
import { useSportLevelContext } from '@/contexts/useSportLevelContext';
import { resolveActivePrimarySport } from '@/utils/profileSports';
import { sharePlayerProfile } from '@/utils/sharePlayerProfile';
import { appendLevelSportQuery } from '@/utils/levelSportQuery';
import { queryKeys } from '@/queries/queryKeys';
import { useUserStatsQuery } from '@/queries/useUserStatsQuery';
import { resolveLevelSport } from './resolveLevelSport';
import type { PlayerProfileViewModel, UsePlayerProfileOptions } from './types';

export function usePlayerProfile(
  playerId: string | null | undefined,
  options: UsePlayerProfileOptions = {},
): PlayerProfileViewModel {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    levelSport: explicitLevelSport,
    sportFromUrl,
    presenceKey: presenceKeyOption,
    enabled: enabledOption,
    onShareFallback,
    onBlocked,
    onStartChat,
    onOpenFullProfile,
  } = options;
  const user = useAuthStore((state) => state.user);
  const viewerUserId = user?.id;
  const updateUser = useAuthStore((state) => state.updateUser);
  const { addFavorite, removeFavorite } = useFavoritesStore();
  const contextLevelSport = useSportLevelContext();
  const viewerDefault = user ? resolveActivePrimarySport(user) ?? undefined : undefined;

  const levelSport = useMemo(
    () =>
      resolveLevelSport({
        explicit: explicitLevelSport,
        fromUrl: sportFromUrl,
        fromContext: contextLevelSport,
        viewerDefault,
      }),
    [explicitLevelSport, sportFromUrl, contextLevelSport, viewerDefault],
  );

  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedCheckPending, setBlockedCheckPending] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [blockingUser, setBlockingUser] = useState(false);

  const enabled = enabledOption ?? !!playerId;
  const isCurrentUser = !!(viewerUserId && playerId && viewerUserId === playerId);
  const needsBlockedCheck = enabled && !!playerId && !!viewerUserId && viewerUserId !== playerId;
  const presenceKey = presenceKeyOption ?? 'player-profile';

  const statsQueryEnabled = enabled && !!playerId;
  const {
    data: statsData,
    isPending,
    isError,
  } = useUserStatsQuery(playerId ?? undefined, levelSport, {
    enabled: statsQueryEnabled,
    keepPrevious: true,
  });

  const stats = statsQueryEnabled ? (statsData ?? null) : null;
  const statsLoading = statsQueryEnabled && isPending && !statsData;
  const loading = statsLoading || (needsBlockedCheck && blockedCheckPending);
  const error = statsQueryEnabled && isError;

  useEffect(() => {
    if (!needsBlockedCheck) {
      setIsBlocked(false);
      setBlockedCheckPending(false);
      return;
    }

    let cancelled = false;
    setBlockedCheckPending(true);
    blockedUsersApi
      .checkIfUserBlocked(playerId!)
      .then((blocked) => {
        if (!cancelled) {
          setIsBlocked(blocked);
          setBlockedCheckPending(false);
        }
      })
      .catch(() => {
        if (!cancelled) setBlockedCheckPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [needsBlockedCheck, playerId]);

  const setStats = useCallback(
    (nextStats: UserStats) => {
      if (!playerId) return;
      const sportKey = nextStats.sport ?? levelSport;
      queryClient.setQueryData(queryKeys.userStats(playerId, sportKey), nextStats);
      queryClient.setQueriesData<UserStats>(
        { queryKey: ['users', 'stats', playerId] },
        (previous) => {
          if (!previous) return previous;
          const previousSport = previous.sport ?? levelSport;
          if (previousSport === sportKey) return nextStats;
          return {
            ...previous,
            followersCount: nextStats.followersCount,
            followingCount: nextStats.followingCount,
            user: {
              ...previous.user,
              isFavorite: nextStats.user.isFavorite,
            },
          };
        },
      );
    },
    [queryClient, playerId, levelSport],
  );

  const presenceUserIds = useMemo(
    () => (viewerUserId && playerId && !isCurrentUser ? [playerId] : []),
    [viewerUserId, playerId, isCurrentUser],
  );
  usePresenceSubscription(presenceKey, presenceUserIds);

  useEffect(() => {
    if (!viewerUserId || !playerId || isCurrentUser) return;
    usersApi.getPresence([playerId]).then((data) => {
      if (Object.keys(data).length > 0) usePresenceStore.getState().setPresenceInitial(data);
    }).catch(() => {});
  }, [playerId, isCurrentUser, viewerUserId]);

  const toggleFavorite = useCallback(async () => {
    if (!playerId || !stats || isBlocked) return;
    try {
      if (stats.user.isFavorite) {
        await favoritesApi.removeUserFromFavorites(playerId);
        setStats({
          ...stats,
          user: { ...stats.user, isFavorite: false },
          followersCount: Math.max(0, stats.followersCount - 1),
        });
        removeFavorite(playerId);
        toast.success(t('favorites.userRemovedFromFavorites'));
      } else {
        await favoritesApi.addUserToFavorites(playerId);
        setStats({
          ...stats,
          user: { ...stats.user, isFavorite: true },
          followersCount: stats.followersCount + 1,
        });
        addFavorite(playerId);
        toast.success(t('favorites.userAddedToFavorites'));
      }
    } catch (err: unknown) {
      const errorMessage =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  }, [playerId, stats, isBlocked, t, removeFavorite, addFavorite, setStats]);

  const startChat = useCallback(async () => {
    if (!playerId || startingChat || isBlocked) return;
    setStartingChat(true);
    try {
      const chat = await usePlayersStore.getState().getOrCreateAndAddUserChat(playerId);
      if (!chat) {
        toast.error(t('errors.generic', { defaultValue: 'Something went wrong' }));
        return;
      }
      const skipDefault = onStartChat?.(chat);
      if (!skipDefault) {
        navigate(`/user-chat/${chat.id}`, {
          state: { chat, contextType: 'USER' },
        });
      }
    } catch (err: unknown) {
      const errorMessage =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setStartingChat(false);
    }
  }, [playerId, startingChat, isBlocked, navigate, t, onStartChat]);

  const share = useCallback(async () => {
    if (!playerId || !stats || isBlocked) return;
    await sharePlayerProfile({
      playerId,
      sport: levelSport,
      t,
      onFallbackModal: onShareFallback ?? (() => {}),
    });
  }, [playerId, stats, isBlocked, levelSport, t, onShareFallback]);

  const openFullProfile = useCallback(() => {
    if (!playerId || isCurrentUser) return;
    const skipDefault = onOpenFullProfile?.(levelSport);
    if (!skipDefault) {
      navigate(appendLevelSportQuery(`/user-profile/${playerId}`, levelSport));
    }
  }, [playerId, isCurrentUser, levelSport, navigate, onOpenFullProfile]);

  const blockOrUnblock = useCallback(async () => {
    if (!playerId || blockingUser) return;
    setBlockingUser(true);
    try {
      if (isBlocked) {
        await blockedUsersApi.unblockUser(playerId);
        setIsBlocked(false);
        toast.success(t('playerCard.userUnblocked') || 'User unblocked');
      } else {
        await blockedUsersApi.blockUser(playerId);
        setIsBlocked(true);
        toast.success(t('playerCard.userBlocked') || 'User blocked');
        onBlocked?.();
      }
      try {
        const profileResponse = await usersApi.getProfile();
        updateUser(profileResponse.data);
      } catch (err) {
        console.error('Failed to refresh user profile after block/unblock:', err);
      }
    } catch (err: unknown) {
      const errorMessage =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setBlockingUser(false);
    }
  }, [playerId, blockingUser, isBlocked, t, updateUser, onBlocked]);

  const block = useCallback(async () => {
    if (isBlocked) return;
    await blockOrUnblock();
  }, [isBlocked, blockOrUnblock]);

  const unblock = useCallback(async () => {
    if (!isBlocked) return;
    await blockOrUnblock();
  }, [isBlocked, blockOrUnblock]);

  const actions = useMemo(
    () => ({
      toggleFavorite,
      startChat,
      block,
      unblock,
      share,
      openFullProfile,
    }),
    [toggleFavorite, startChat, block, unblock, share, openFullProfile],
  );

  return {
    stats,
    loading,
    error,
    isCurrentUser,
    isBlocked,
    levelSport,
    setStats,
    startingChat,
    blockingUser,
    actions,
  };
}
