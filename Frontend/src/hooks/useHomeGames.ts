import { useState, useEffect, useCallback, useRef } from 'react';
import { gamesApi, invitesApi } from '@/api';
import { chatApi } from '@/api/chat';
import { Game, Invite } from '@/types';
import { socketService } from '@/services/socketService';
import { useHeaderStore } from '@/store/headerStore';

export const useHomeGames = (
  user: any,
  onLoading: (loading: boolean) => void,
  skeletonAnimation?: { showSkeletonsAnimated: () => void; hideSkeletonsAnimated: () => void }
) => {
  const [games, setGames] = useState<Game[]>([]);
  const [availableGames, setAvailableGames] = useState<Game[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [gamesUnreadCounts, setGamesUnreadCounts] = useState<Record<string, number>>({});
  const showChatFilter = useHeaderStore((state) => state.showChatFilter);

  // Request deduplication
  const isLoadingRef = useRef(false);
  const lastFetchParamsRef = useRef<string | null>(null);
  const isLoadingUnreadGamesRef = useRef(false);

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

  const loadAllGamesWithUnread = useCallback(async () => {
    if (!user?.id || isLoadingUnreadGamesRef.current) return;

    isLoadingUnreadGamesRef.current = true;
    try {
      const allChatGamesResponse = await chatApi.getUserChatGames();
      const allChatGames = allChatGamesResponse.data;
      
      if (allChatGames.length === 0) {
        isLoadingUnreadGamesRef.current = false;
        return;
      }

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const upcomingChatGames = allChatGames.filter(game => {
        const gameDate = new Date(game.startTime);
        return gameDate >= yesterday;
      });

      if (upcomingChatGames.length === 0) {
        isLoadingUnreadGamesRef.current = false;
        return;
      }

      const gameIds = upcomingChatGames.map(game => game.id);
      const unreadCounts = await chatApi.getGamesUnreadCounts(gameIds);
      
      const gamesWithUnread = upcomingChatGames.filter(game => (unreadCounts.data[game.id] || 0) > 0);
      
      if (gamesWithUnread.length > 0) {
        setGames(prevGames => {
          const existingGameIds = new Set(prevGames.map(g => g.id));
          const newGames = gamesWithUnread.filter(game => !existingGameIds.has(game.id));
          
          if (newGames.length === 0) return prevGames;
          
          const mergedGames = [...prevGames, ...newGames];
          return sortGames(mergedGames);
        });
        
        setGamesUnreadCounts(prev => ({ ...prev, ...unreadCounts.data }));
      }
    } catch (error) {
      console.error('Failed to load games with unread messages:', error);
    } finally {
      isLoadingUnreadGamesRef.current = false;
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.currentCity?.id) {
      fetchData();
    }
  }, [user?.currentCity?.id, fetchData]);

  useEffect(() => {
    if (showChatFilter && user?.id) {
      loadAllGamesWithUnread();
    }
  }, [showChatFilter, user?.id, loadAllGamesWithUnread]);

  // Listen for new invites and deleted invites via Socket.IO
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

    const handleInviteDeleted = (data: { inviteId: string; gameId?: string }) => {
      setInvites(prevInvites => prevInvites.filter(invite => invite.id !== data.inviteId));
    };

    socketService.on('new-invite', handleNewInvite);
    socketService.on('invite-deleted', handleInviteDeleted);

    return () => {
      socketService.off('new-invite', handleNewInvite);
      socketService.off('invite-deleted', handleInviteDeleted);
    };
  }, []);

  return {
    games,
    availableGames,
    invites,
    gamesUnreadCounts,
    fetchData,
    setInvites,
    loadAllGamesWithUnread,
  };
};

