import { useState, useCallback, useRef, useEffect } from 'react';
import { gamesApi } from '@/api';
import { chatApi } from '@/api/chat';
import { Game } from '@/types';
import { useSocketEventsStore } from '@/store/socketEventsStore';

export const usePastGames = (user: any, shouldLoad: boolean = false) => {
  const [pastGames, setPastGames] = useState<Game[]>([]);
  const [loadingPastGames, setLoadingPastGames] = useState(false);
  const [pastGamesOffset, setPastGamesOffset] = useState(0);
  const [hasMorePastGames, setHasMorePastGames] = useState(true);
  const [pastGamesUnreadCounts, setPastGamesUnreadCounts] = useState<Record<string, number>>({});

  const isLoadingRef = useRef(false);
  const lastFetchParamsRef = useRef<string | null>(null);

  const sortGames = (games: Game[]) => {
    return games.sort((a, b) => {
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    });
  };

  const fetchGamesWithUnread = async (myGames: Game[], userId: string): Promise<Record<string, number>> => {
    const accessibleGameIds = myGames
      .filter(game => {
        const isParticipant = game.participants.some(p => p.userId === userId);
        const hasPendingInvite = game.participants?.some(p => p.userId === userId && p.status === 'INVITED');
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

  const loadPastGames = useCallback(async () => {
    if (!user?.id || loadingPastGames || !hasMorePastGames) return;

    const fetchParams = `past-games-${user.id}-${pastGamesOffset}`;

    if (isLoadingRef.current || lastFetchParamsRef.current === fetchParams) {
      return;
    }

    isLoadingRef.current = true;
    lastFetchParamsRef.current = fetchParams;

    setLoadingPastGames(true);
    try {
      const response = await gamesApi.getPastGames({
        limit: 30,
        offset: pastGamesOffset,
      });
      
      const newPastGames = response.data || [];
      
      if (newPastGames.length < 30) {
        setHasMorePastGames(false);
      }
      
      const unreadCounts = await fetchGamesWithUnread(newPastGames, user.id);
      
      setPastGames(prev => {
        const existingGameIds = new Set(prev.map(g => g.id));
        const uniqueNewGames = newPastGames.filter(game => !existingGameIds.has(game.id));
        return sortGames([...prev, ...uniqueNewGames]);
      });
      setPastGamesUnreadCounts(prev => ({ ...prev, ...unreadCounts }));
      setPastGamesOffset(pastGamesOffset + 30);
    } catch (error) {
      console.error('Failed to load past games:', error);
    } finally {
      isLoadingRef.current = false;
      setLoadingPastGames(false);
    }
  }, [user?.id, loadingPastGames, hasMorePastGames, pastGamesOffset]);

  useEffect(() => {
    if (shouldLoad && pastGames.length === 0 && !loadingPastGames && user?.id) {
      loadPastGames();
    }
  }, [shouldLoad, pastGames.length, loadingPastGames, user?.id, loadPastGames]);

  const lastGameUpdate = useSocketEventsStore((state) => state.lastGameUpdate);

  useEffect(() => {
    if (!lastGameUpdate || lastGameUpdate.senderId === user?.id) return;
    
    const data = lastGameUpdate;
    const updatedGame = data.game;
    
    setPastGames(prevPastGames => {
      const gameIndex = prevPastGames.findIndex(g => g.id === data.gameId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (gameIndex === -1) {
        const isParticipant = updatedGame.participants.some((p: any) => p.userId === user?.id);
        const isArchived = updatedGame.status === 'ARCHIVED';
        
        if (isParticipant && isArchived) {
          const gameDate = new Date(updatedGame.startTime);
          gameDate.setHours(0, 0, 0, 0);
          if (gameDate < today) {
            const newGames = [...prevPastGames, updatedGame];
            return sortGames(newGames);
          }
        }
        return prevPastGames;
      }
      
      const isParticipant = updatedGame.participants.some((p: any) => p.userId === user?.id);
      const isArchived = updatedGame.status === 'ARCHIVED';
      
      if (!isParticipant || !isArchived) {
        return prevPastGames.filter(g => g.id !== data.gameId);
      }
      
      const gameDate = new Date(updatedGame.startTime);
      gameDate.setHours(0, 0, 0, 0);
      if (gameDate >= today) {
        return prevPastGames.filter(g => g.id !== data.gameId);
      }
      
      const updatedGames = [...prevPastGames];
      updatedGames[gameIndex] = updatedGame;
      return sortGames(updatedGames);
    });
  }, [lastGameUpdate, user?.id]);

  const refetchGame = useCallback(async (gameId: string) => {
    if (!user?.id) return;
    try {
      const response = await gamesApi.getById(gameId);
      const updatedGame = response.data;
      setPastGames(prev => {
        const idx = prev.findIndex(g => g.id === gameId);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = updatedGame;
        return sortGames(next);
      });
    } catch {
      // ignore
    }
  }, [user?.id]);

  return {
    pastGames,
    loadingPastGames,
    hasMorePastGames,
    pastGamesUnreadCounts,
    loadPastGames,
    refetchGame,
  };
};
