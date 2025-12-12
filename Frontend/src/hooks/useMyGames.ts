import { useState, useEffect, useCallback, useRef } from 'react';
import { invitesApi } from '@/api';
import { chatApi } from '@/api/chat';
import { gamesApi } from '@/api';
import { Game, Invite } from '@/types';
import { socketService } from '@/services/socketService';
import { useHeaderStore } from '@/store/headerStore';

export const useMyGames = (
  user: any,
  onLoading: (loading: boolean) => void,
  skeletonAnimation?: { showSkeletonsAnimated: () => void; hideSkeletonsAnimated: () => void }
) => {
  const [games, setGames] = useState<Game[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [gamesUnreadCounts, setGamesUnreadCounts] = useState<Record<string, number>>({});
  const showChatFilter = useHeaderStore((state) => state.showChatFilter);

  const isLoadingRef = useRef(false);
  const lastFetchParamsRef = useRef<string | null>(null);
  const isLoadingUnreadGamesRef = useRef(false);

  const sortGames = (games: Game[]) => {
    return games.sort((a, b) => {
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    });
  };

  const fetchGamesWithUnread = async (myGames: Game[], userId: string): Promise<Record<string, number>> => {
    const accessibleGameIds = myGames
      .filter(game => {
        const isParticipant = game.participants.some(p => p.userId === userId);
        const hasPendingInvite = game.invites?.some(invite => invite.receiverId === userId);
        return isParticipant || hasPendingInvite;
      })
      .map(game => game.id);

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
    if (!user?.id) return;

    const fetchParams = `my-games-${user.id}`;

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

      const [gamesResponse, invitesResponse] = await Promise.all([
        gamesApi.getMyGames(),
        invitesApi.getMyInvites('PENDING')
      ]);

      const myGames = gamesResponse.data || [];
      const unreadCounts = await fetchGamesWithUnread(myGames, user.id);

      const sortedMyGames = sortGames(myGames);

      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, 1000 - elapsedTime);
      if (remainingTime > 0 && showLoader) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }

      setGames(sortedMyGames);
      setInvites(invitesResponse.data);
      setGamesUnreadCounts(unreadCounts);
    } catch (error) {
      console.error('Failed to fetch my games:', error);
    } finally {
      isLoadingRef.current = false;
      if (showLoader) {
        skeletonAnimation?.hideSkeletonsAnimated();
        onLoading(false);
      }
    }
  }, [user?.id, skeletonAnimation, onLoading]);

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

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const upcomingChatGames = allChatGames.filter(game => {
        if (game.status === 'ARCHIVED') {
          const gameDate = new Date(game.startTime);
          gameDate.setHours(0, 0, 0, 0);
          return gameDate >= today;
        }
        const gameDate = new Date(game.startTime);
        gameDate.setHours(0, 0, 0, 0);
        return gameDate >= today;
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
    if (user?.id) {
      fetchData();
    }
  }, [user?.id, fetchData]);

  useEffect(() => {
    if (showChatFilter && user?.id) {
      loadAllGamesWithUnread();
    }
  }, [showChatFilter, user?.id, loadAllGamesWithUnread]);

  useEffect(() => {
    const handleNewInvite = (invite: Invite) => {
      setInvites(prevInvites => {
        const exists = prevInvites.some(existingInvite => existingInvite.id === invite.id);
        if (exists) return prevInvites;
        return [invite, ...prevInvites];
      });
    };

    const handleInviteDeleted = (data: { inviteId: string; gameId?: string }) => {
      setInvites(prevInvites => prevInvites.filter(invite => invite.id !== data.inviteId));
    };

    const handleGameUpdated = (data: { gameId: string; senderId: string; game: Game; forceUpdate?: boolean }) => {
      if (!data.forceUpdate && data.senderId === user?.id) return;

      const updatedGame = data.game;

      setGames(prevGames => {
        const gameIndex = prevGames.findIndex(g => g.id === data.gameId);
        const isParticipant = updatedGame.participants.some((p: any) => p.userId === user?.id);

        if (gameIndex === -1) {
          if (!isParticipant) return prevGames;

          const isArchived = updatedGame.status === 'ARCHIVED';
          if (!isArchived) {
            const newGames = [...prevGames, updatedGame];
            return sortGames(newGames);
          }

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const gameDate = new Date(updatedGame.startTime);
          gameDate.setHours(0, 0, 0, 0);
          if (gameDate >= today) {
            const newGames = [...prevGames, updatedGame];
            return sortGames(newGames);
          }
          return prevGames;
        }

        if (!isParticipant) {
          return prevGames.filter(g => g.id !== data.gameId);
        }

        const isArchived = updatedGame.status === 'ARCHIVED';
        if (isArchived) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const gameDate = new Date(updatedGame.startTime);
          gameDate.setHours(0, 0, 0, 0);
          if (gameDate < today) {
            return prevGames.filter(g => g.id !== data.gameId);
          }
        }

        const updatedGames = [...prevGames];
        updatedGames[gameIndex] = updatedGame;
        return sortGames(updatedGames);
      });
    };

    socketService.on('new-invite', handleNewInvite);
    socketService.on('invite-deleted', handleInviteDeleted);
    socketService.on('game-updated', handleGameUpdated);

    return () => {
      socketService.off('new-invite', handleNewInvite);
      socketService.off('invite-deleted', handleInviteDeleted);
      socketService.off('game-updated', handleGameUpdated);
    };
  }, [user?.id]);

  return {
    games,
    invites,
    gamesUnreadCounts,
    fetchData,
    setInvites,
    loadAllGamesWithUnread,
  };
};
