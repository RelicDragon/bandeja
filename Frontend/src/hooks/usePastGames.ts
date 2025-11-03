import { useState, useCallback, useRef, useEffect } from 'react';
import { gamesApi } from '@/api';
import { chatApi } from '@/api/chat';
import { Game } from '@/types';
import { useHeaderStore } from '@/store/headerStore';
import { socketService } from '@/services/socketService';
import { calculateGameStatus } from '@/utils/gameStatus';

export const usePastGames = (user: any) => {
  const [pastGames, setPastGames] = useState<Game[]>([]);
  const [loadingPastGames, setLoadingPastGames] = useState(false);
  const [showPastGames, setShowPastGames] = useState(false);
  const [pastGamesOffset, setPastGamesOffset] = useState(0);
  const [hasMorePastGames, setHasMorePastGames] = useState(true);
  const [pastGamesUnreadCounts, setPastGamesUnreadCounts] = useState<Record<string, number>>({});
  const showChatFilter = useHeaderStore((state) => state.showChatFilter);

  // Request deduplication
  const isLoadingRef = useRef(false);
  const lastFetchParamsRef = useRef<string | null>(null);
  const isLoadingUnreadPastGamesRef = useRef(false);

  const sortGames = (games: Game[]) => {
    return games.sort((a, b) => {
      if (a.status === 'ARCHIVED' && b.status !== 'ARCHIVED') return 1;
      if (a.status !== 'ARCHIVED' && b.status === 'ARCHIVED') return -1;
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
    if (!user?.currentCity?.id || loadingPastGames || !hasMorePastGames) return;

    // Create a unique key for this request to prevent duplicates
    const fetchParams = `past-city-${user.currentCity.id}-${pastGamesOffset}`;

    // Prevent duplicate requests
    if (isLoadingRef.current || lastFetchParamsRef.current === fetchParams) {
      return;
    }

    isLoadingRef.current = true;
    lastFetchParamsRef.current = fetchParams;

    setLoadingPastGames(true);
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(23, 59, 59, 999);

      const response = await gamesApi.getAll({
        cityId: user.currentCity.id,
        endDate: yesterday.toISOString(),
        limit: 20,
        offset: pastGamesOffset,
      });
      
      const newPastGames = sortGames(
        response.data.filter((game) => game.participants.some((p) => p.userId === user?.id))
      );
      
      if (newPastGames.length < 20) {
        setHasMorePastGames(false);
      }
      
      const unreadCounts = await fetchGamesWithUnread(newPastGames, user?.id);
      
      setPastGames(prev => [...prev, ...newPastGames]);
      setPastGamesUnreadCounts(prev => ({ ...prev, ...unreadCounts }));
      setPastGamesOffset(pastGamesOffset + 20);
    } catch (error) {
      console.error('Failed to load past games:', error);
    } finally {
      isLoadingRef.current = false;
      setLoadingPastGames(false);
    }
  }, [user?.currentCity?.id, user?.id, loadingPastGames, hasMorePastGames, pastGamesOffset]);

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

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(23, 59, 59, 999);

      const pastChatGames = allChatGames.filter(game => {
        const gameDate = new Date(game.startTime);
        return gameDate <= yesterday;
      });

      if (pastChatGames.length === 0) {
        isLoadingUnreadPastGamesRef.current = false;
        return;
      }

      const gameIds = pastChatGames.map(game => game.id);
      const unreadCounts = await chatApi.getGamesUnreadCounts(gameIds);
      
      const pastGamesWithUnread = pastChatGames.filter(game => (unreadCounts.data[game.id] || 0) > 0);
      
      if (pastGamesWithUnread.length > 0) {
        setPastGames(prevGames => {
          const existingGameIds = new Set(prevGames.map(g => g.id));
          const newGames = pastGamesWithUnread.filter(game => !existingGameIds.has(game.id));
          
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

  const togglePastGames = useCallback(() => {
    setShowPastGames(!showPastGames);
    if (!showPastGames && pastGames.length === 0) {
      loadPastGames();
    }
  }, [showPastGames, pastGames.length, loadPastGames]);

  useEffect(() => {
    const handleGameUpdated = (data: { gameId: string; senderId: string; game: Game }) => {
      if (data.senderId === user?.id) return; // Don't update if current user made the change
      
      // Calculate status using current client time
      const updatedGame = {
        ...data.game,
        status: calculateGameStatus(data.game, new Date().toISOString())
      };
      
      setPastGames(prevPastGames => {
        const gameIndex = prevPastGames.findIndex(g => g.id === data.gameId);
        if (gameIndex === -1) {
          // Game not in list, check if it should be added
          const isParticipant = updatedGame.participants.some((p: any) => p.userId === user?.id);
          if (isParticipant) {
            const newGames = [...prevPastGames, updatedGame];
            return sortGames(newGames);
          }
          return prevPastGames;
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
    showPastGames,
    hasMorePastGames,
    pastGamesUnreadCounts,
    loadPastGames,
    togglePastGames,
    loadAllPastGamesWithUnread,
  };
};

