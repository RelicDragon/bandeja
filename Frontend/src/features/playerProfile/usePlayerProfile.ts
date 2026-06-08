import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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
import { loadPlayerProfileData } from './loadPlayerProfileData';
import { resolveLevelSport } from './resolveLevelSport';
import type { PlayerProfileViewModel, UsePlayerProfileOptions } from './types';

export function usePlayerProfile(
  playerId: string | null | undefined,
  options: UsePlayerProfileOptions = {},
): PlayerProfileViewModel {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const { addFavorite, removeFavorite } = useFavoritesStore();
  const contextLevelSport = useSportLevelContext();
  const viewerDefault = user ? resolveActivePrimarySport(user) ?? undefined : undefined;

  const levelSport = useMemo(
    () =>
      resolveLevelSport({
        explicit: options.levelSport,
        fromUrl: options.sportFromUrl,
        fromContext: contextLevelSport,
        viewerDefault,
      }),
    [options.levelSport, options.sportFromUrl, contextLevelSport, viewerDefault],
  );

  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [blockingUser, setBlockingUser] = useState(false);

  const enabled = options.enabled ?? !!playerId;
  const isCurrentUser = !!(user && playerId && user.id === playerId);
  const presenceKey = options.presenceKey ?? 'player-profile';

  useEffect(() => {
    if (!enabled || !playerId) {
      setStats(null);
      setLoading(false);
      setError(false);
      setIsBlocked(false);
      return;
    }

    let cancelled = false;
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(false);
        const data = await loadPlayerProfileData(playerId, levelSport, user?.id);
        if (!cancelled) {
          setStats(data.stats);
          setIsBlocked(data.isBlocked);
        }
      } catch (err) {
        console.error('Failed to fetch player profile:', err);
        if (!cancelled) {
          setStats(null);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [enabled, playerId, levelSport, user?.id]);

  usePresenceSubscription(
    presenceKey,
    user && playerId && !isCurrentUser ? [playerId] : [],
  );

  useEffect(() => {
    if (!user || !playerId || isCurrentUser) return;
    usersApi.getPresence([playerId]).then((data) => {
      if (Object.keys(data).length > 0) usePresenceStore.getState().setPresenceInitial(data);
    }).catch(() => {});
  }, [playerId, isCurrentUser, user]);

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
  }, [playerId, stats, isBlocked, t, removeFavorite, addFavorite]);

  const startChat = useCallback(async () => {
    if (!playerId || startingChat || isBlocked) return;
    setStartingChat(true);
    try {
      const chat = await usePlayersStore.getState().getOrCreateAndAddUserChat(playerId);
      if (!chat) {
        toast.error(t('errors.generic', { defaultValue: 'Something went wrong' }));
        return;
      }
      const skipDefault = options.onStartChat?.(chat);
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
  }, [playerId, startingChat, isBlocked, navigate, t, options]);

  const share = useCallback(async () => {
    if (!playerId || !stats || isBlocked) return;
    await sharePlayerProfile({
      playerId,
      sport: levelSport,
      t,
      onFallbackModal: options.onShareFallback ?? (() => {}),
    });
  }, [playerId, stats, isBlocked, levelSport, t, options]);

  const openFullProfile = useCallback(() => {
    if (!playerId || isCurrentUser) return;
    const skipDefault = options.onOpenFullProfile?.(levelSport);
    if (!skipDefault) {
      navigate(appendLevelSportQuery(`/user-profile/${playerId}`, levelSport));
    }
  }, [playerId, isCurrentUser, levelSport, navigate, options]);

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
        options.onBlocked?.();
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
  }, [playerId, blockingUser, isBlocked, t, updateUser, options]);

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
