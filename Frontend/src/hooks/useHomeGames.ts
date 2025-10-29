import { useState, useEffect, useCallback, useRef } from 'react';
import { gamesApi, invitesApi } from '@/api';
import { chatApi } from '@/api/chat';
import { Game, Invite } from '@/types';
import { socketService } from '@/services/socketService';

export const useHomeGames = (
  user: any,
  onLoading: (loading: boolean) => void,
  skeletonAnimation?: { showSkeletonsAnimated: () => void; hideSkeletonsAnimated: () => void }
) => {
  const [games, setGames] = useState<Game[]>([]);
  const [availableGames, setAvailableGames] = useState<Game[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [gamesUnreadCounts, setGamesUnreadCounts] = useState<Record<string, number>>({});

  // Request deduplication
  const isLoadingRef = useRef(false);
  const lastFetchParamsRef = useRef<string | null>(null);

  const sortGames = (games: Game[]) => {
    return games.sort((a, b) => {
      if (a.status === 'ARCHIVED' && b.status !== 'ARCHIVED') return 1;
      if (a.status !== 'ARCHIVED' && b.status === 'ARCHIVED') return -1;
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    });
  };

  const fetchGamesWithUnread = async (myGames: Game[], userId: string): Promise<Record<string, number>> => {
    // Filter games where user can access chat (is participant or has pending invite)
    const accessibleGameIds = myGames
      .filter(game => {
        const isParticipant = game.participants.some(p => p.userId === userId);
        const hasPendingInvite = game.invites?.some(invite => invite.receiverId === userId);
        return isParticipant || hasPendingInvite;
      })
      .map(game => game.id);

    // Use batch API to get unread counts for all accessible games at once
    if (accessibleGameIds.length > 0) {
      try {
        const unreadResponse = await chatApi.getGamesUnreadCounts(accessibleGameIds);
        return unreadResponse.data;
      } catch (error) {
        console.error('Failed to fetch unread counts:', error);
        return {};
      }
    }

    return {};
  };

  const fetchData = useCallback(async (showLoader = true, force = false) => {
    if (!user?.currentCity?.id) return;

    // Create a unique key for this request to prevent duplicates
    const fetchParams = `city-${user.currentCity.id}`;

    // Prevent duplicate requests unless forced
    if (!force && (isLoadingRef.current || lastFetchParamsRef.current === fetchParams)) {
      return;
    }

    isLoadingRef.current = true;
    lastFetchParamsRef.current = fetchParams;

    try {
      const startTime = Date.now();
      if (showLoader) {
        skeletonAnimation?.showSkeletonsAnimated();
        onLoading(true);
      }

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const [gamesResponse, invitesResponse] = await Promise.all([
        gamesApi.getAll({
          cityId: user.currentCity.id,
          startDate: yesterday.toISOString(),
        }),
        invitesApi.getMyInvites('PENDING')
      ]);
      
      const myGames = gamesResponse.data.filter((game) =>
        game.participants.some((p) => p.userId === user?.id)
      );
      
      const availableGamesFiltered = gamesResponse.data.filter(
        (game) =>
          !game.participants.some((p) => p.userId === user?.id) &&
          game.participants.length < game.maxParticipants &&
          new Date(game.startTime) > new Date()
      );
      
      const unreadCounts = await fetchGamesWithUnread(myGames, user?.id);
      
      const sortedMyGames = sortGames(myGames);
      
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, 1000 - elapsedTime);
      if (remainingTime > 0 && showLoader) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }
      
      setGames(sortedMyGames);
      setAvailableGames(availableGamesFiltered);
      setInvites(invitesResponse.data);
      setGamesUnreadCounts(unreadCounts);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      isLoadingRef.current = false;
      if (showLoader) {
        skeletonAnimation?.hideSkeletonsAnimated();
        onLoading(false);
      }
    }
  }, [user?.currentCity?.id, user?.id, skeletonAnimation, onLoading]);

  useEffect(() => {
    if (user?.currentCity?.id) {
      fetchData();
    }
  }, [user?.currentCity?.id, fetchData]);

  // Listen for new invites via Socket.IO
  useEffect(() => {
    const handleNewInvite = (invite: Invite) => {
      setInvites(prevInvites => {
        // Check if invite already exists to avoid duplicates
        const exists = prevInvites.some(existingInvite => existingInvite.id === invite.id);
        if (exists) return prevInvites;

        // Add new invite at the beginning of the array (most recent first)
        return [invite, ...prevInvites];
      });
    };

    socketService.on('new-invite', handleNewInvite);

    return () => {
      socketService.off('new-invite', handleNewInvite);
    };
  }, []);

  return {
    games,
    availableGames,
    invites,
    gamesUnreadCounts,
    fetchData,
    setInvites,
  };
};

