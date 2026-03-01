import { useState, useEffect, useCallback, useRef } from 'react';
import { gamesApi, invitesApi } from '@/api';
import { chatApi } from '@/api/chat';
import { Game, Invite } from '@/types';
import { useSocketEventsStore } from '@/store/socketEventsStore';

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
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    });
  };

  const fetchGamesWithUnread = async (myGames: Game[], userId: string): Promise<Record<string, number>> => {
    // Filter games where user can access chat (is participant or has pending invite)
    const accessibleGameIds = myGames
      .filter(game => {
        const isParticipant = game.participants.some(p => p.userId === userId);
        const hasPendingInvite = game.participants?.some(p => p.userId === userId && p.status === 'INVITED');
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

    const fetchParams = `city-${user.currentCity.id}`;

    if (!force && (isLoadingRef.current || lastFetchParamsRef.current === fetchParams)) {
      return;
    }

    isLoadingRef.current = true;
    lastFetchParamsRef.current = fetchParams;

    try {
      if (showLoader) {
        skeletonAnimation?.showSkeletonsAnimated();
        onLoading(true);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [nonArchivedGamesResponse, archivedGamesResponse, invitesResponse] = await Promise.all([
        gamesApi.getAll({
          cityId: user.currentCity.id,
        }),
        gamesApi.getAll({
          cityId: user.currentCity.id,
          startDate: today.toISOString(),
          status: 'ARCHIVED',
        }),
        invitesApi.getMyInvites('PENDING')
      ]);
      
      const nonArchivedGames = nonArchivedGamesResponse.data.filter((game) => game.status !== 'ARCHIVED');
      const archivedGamesToday = archivedGamesResponse.data.filter((game) => {
        const gameDate = new Date(game.startTime);
        gameDate.setHours(0, 0, 0, 0);
        return gameDate >= today;
      });
      
      const allGames = [...nonArchivedGames, ...archivedGamesToday];
      
      const myGames = allGames.filter((game) => {
        const isParticipant = game.participants.some((p) => p.userId === user?.id);
        if (!isParticipant) return false;
        
        if (game.status !== 'ARCHIVED') return true;
        
        const gameDate = new Date(game.startTime);
        gameDate.setHours(0, 0, 0, 0);
        return gameDate >= today;
      });
      
      const availableGamesFiltered = allGames.filter((game) => {
        const isParticipant = game.participants.some((p) => p.userId === user?.id);
        if (isParticipant) return false;
        if (game.status === 'ARCHIVED') return false;
        
        const gameDate = new Date(game.startTime);
        gameDate.setHours(0, 0, 0, 0);
        if (gameDate < today) return false;
        
        return game.participants.length < game.maxParticipants;
      });
      
      const unreadCounts = await fetchGamesWithUnread(myGames, user?.id);
      const sortedMyGames = sortGames(myGames);

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


  const lastNewInvite = useSocketEventsStore((state) => state.lastNewInvite);
  const lastInviteDeleted = useSocketEventsStore((state) => state.lastInviteDeleted);
  const lastGameUpdate = useSocketEventsStore((state) => state.lastGameUpdate);

  useEffect(() => {
    if (!lastNewInvite) return;
    setInvites(prevInvites => {
      const exists = prevInvites.some(existingInvite => existingInvite.id === lastNewInvite.id);
      if (exists) return prevInvites;
      return [lastNewInvite, ...prevInvites];
    });
  }, [lastNewInvite]);

  useEffect(() => {
    if (!lastInviteDeleted) return;
    setInvites(prevInvites => prevInvites.filter(invite => invite.id !== lastInviteDeleted.inviteId));
  }, [lastInviteDeleted]);

  useEffect(() => {
    if (!lastGameUpdate || (!lastGameUpdate.forceUpdate && lastGameUpdate.senderId === user?.id)) return;
    
    const data = lastGameUpdate;
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
  
    setAvailableGames(prevAvailableGames => {
      const gameIndex = prevAvailableGames.findIndex(g => g.id === data.gameId);
      const isParticipant = updatedGame.participants.some((p: any) => p.userId === user?.id);
      const isArchived = updatedGame.status === 'ARCHIVED';
      const isFull = updatedGame.participants.length >= updatedGame.maxParticipants;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const gameDate = new Date(updatedGame.startTime);
      gameDate.setHours(0, 0, 0, 0);
      const isTodayOrFuture = gameDate >= today;
      
      if (gameIndex === -1) {
        if (!isParticipant && !isArchived && !isFull && isTodayOrFuture) {
          return sortGames([...prevAvailableGames, updatedGame]);
        }
        return prevAvailableGames;
      }
      
      if (isParticipant || isArchived || isFull || !isTodayOrFuture) {
        return prevAvailableGames.filter(g => g.id !== data.gameId);
      }
      
      const updatedGames = [...prevAvailableGames];
      updatedGames[gameIndex] = updatedGame;
      return sortGames(updatedGames);
    });
  }, [lastGameUpdate, user?.id]);

  return {
    games,
    availableGames,
    invites,
    gamesUnreadCounts,
    fetchData,
    setInvites,
  };
};

