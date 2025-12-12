import { useState, useCallback, useRef, useEffect } from 'react';
import { gamesApi } from '@/api';
import { chatApi } from '@/api/chat';
import { Game } from '@/types';
import { useHeaderStore } from '@/store/headerStore';
import { socketService } from '@/services/socketService';

export const usePastGames = (user: any, shouldLoad: boolean = false) => {
  const [pastGames, setPastGames] = useState<Game[]>([]);
  const [loadingPastGames, setLoadingPastGames] = useState(false);
  const [pastGamesOffset, setPastGamesOffset] = useState(0);
  const [hasMorePastGames, setHasMorePastGames] = useState(true);
  const [pastGamesUnreadCounts, setPastGamesUnreadCounts] = useState<Record<string, number>>({});
  const showChatFilter = useHeaderStore((state) => state.showChatFilter);

  const isLoadingRef = useRef(false);
  const lastFetchParamsRef = useRef<string | null>(null);
  const isLoadingUnreadPastGamesRef = useRef(false);

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
        limit: 10,
        offset: pastGamesOffset,
      });
      
      const newPastGames = response.data || [];
      
      if (newPastGames.length < 10) {
        setHasMorePastGames(false);
      }
      
      const unreadCounts = await fetchGamesWithUnread(newPastGames, user.id);
      
      setPastGames(prev => {
        const existingGameIds = new Set(prev.map(g => g.id));
        const uniqueNewGames = newPastGames.filter(game => !existingGameIds.has(game.id));
        return sortGames([...prev, ...uniqueNewGames]);
      });
      setPastGamesUnreadCounts(prev => ({ ...prev, ...unreadCounts }));
      setPastGamesOffset(pastGamesOffset + 10);
    } catch (error) {
      console.error('Failed to load past games:', error);
    } finally {
      isLoadingRef.current = false;
      setLoadingPastGames(false);
    }
  }, [user?.id, loadingPastGames, hasMorePastGames, pastGamesOffset]);

  const loadAllPastGamesWithUnread = useCallback(async () => {
    if (!user?.id || isLoadingUnreadPastGamesRef.current) return;

    isLoadingUnreadPastGamesRef.current = true;
    try {
      const allChatGamesResponse = await chatApi.getUserChatGames();
      const allChatGames = allChatGamesResponse.data;
      
      if (allChatGames.length === 0) {
        isLoadingUnreadPastGamesRef.current = false;
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const archivedChatGames = allChatGames.filter(game => {
        if (game.status !== 'ARCHIVED') return false;
        if (!game.participants.some((p: any) => p.userId === user.id)) return false;
        
        const gameDate = new Date(game.startTime);
        gameDate.setHours(0, 0, 0, 0);
        return gameDate < today;
      });

      if (archivedChatGames.length === 0) {
        isLoadingUnreadPastGamesRef.current = false;
        return;
      }

      const gameIds = archivedChatGames.map(game => game.id);
      const unreadCounts = await chatApi.getGamesUnreadCounts(gameIds);
      
      const archivedGamesWithUnread = archivedChatGames.filter(game => (unreadCounts.data[game.id] || 0) > 0);
      
      if (archivedGamesWithUnread.length > 0) {
        setPastGames(prevGames => {
          const existingGameIds = new Set(prevGames.map(g => g.id));
          const newGames = archivedGamesWithUnread.filter(game => !existingGameIds.has(game.id));
          
          if (newGames.length === 0) return prevGames;
          
          const mergedGames = [...prevGames, ...newGames];
          return sortGames(mergedGames);
        });
        
        setPastGamesUnreadCounts(prev => ({ ...prev, ...unreadCounts.data }));
      }
    } catch (error) {
      console.error('Failed to load past games with unread messages:', error);
    } finally {
      isLoadingUnreadPastGamesRef.current = false;
    }
  }, [user?.id]);

  useEffect(() => {
    if (showChatFilter && user?.id) {
      loadAllPastGamesWithUnread();
    }
  }, [showChatFilter, user?.id, loadAllPastGamesWithUnread]);

  useEffect(() => {
    if (shouldLoad && pastGames.length === 0 && !loadingPastGames && user?.id) {
      loadPastGames();
    }
  }, [shouldLoad, pastGames.length, loadingPastGames, user?.id, loadPastGames]);

  useEffect(() => {
    const handleGameUpdated = (data: { gameId: string; senderId: string; game: Game }) => {
      if (data.senderId === user?.id) return;
      
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
    };

    socketService.on('game-updated', handleGameUpdated);

    return () => {
      socketService.off('game-updated', handleGameUpdated);
    };
  }, [user?.id]);

  return {
    pastGames,
    loadingPastGames,
    hasMorePastGames,
    pastGamesUnreadCounts,
    loadPastGames,
    loadAllPastGamesWithUnread,
  };
};
