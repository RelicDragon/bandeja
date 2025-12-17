import { useState, useEffect, useCallback, useRef } from 'react';
import { gamesApi } from '@/api';
import { Game } from '@/types';
import { socketService } from '@/services/socketService';
import { format } from 'date-fns';

export const useAvailableGames = (user: any, startDate?: Date, endDate?: Date, showArchived?: boolean) => {
  const [availableGames, setAvailableGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);

  const isLoadingRef = useRef(false);
  const lastFetchParamsRef = useRef<string | null>(null);

  const sortGames = (games: Game[]) => {
    return games.sort((a, b) => {
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    });
  };

  const fetchData = useCallback(async (force = false) => {
    if (!user?.id) return;

    const fetchParams = startDate && endDate 
      ? `available-games-${user.id}-${format(startDate, 'yyyy-MM-dd')}-${format(endDate, 'yyyy-MM-dd')}-${showArchived ? 'archived' : 'no-archived'}`
      : `available-games-${user.id}-${showArchived ? 'archived' : 'no-archived'}`;

    if (!force && (isLoadingRef.current || lastFetchParamsRef.current === fetchParams)) {
      return;
    }

    isLoadingRef.current = true;
    lastFetchParamsRef.current = fetchParams;

    setLoading(true);
    try {
      const params: any = {};
      if (startDate && endDate) {
        params.startDate = format(startDate, 'yyyy-MM-dd');
        params.endDate = format(endDate, 'yyyy-MM-dd');
      }
      if (showArchived !== undefined) {
        params.showArchived = showArchived;
      }
      const response = await gamesApi.getAvailableGames(Object.keys(params).length > 0 ? params : undefined);
      const allGames = response.data || [];

      const sortedGames = sortGames(allGames);
      setAvailableGames(sortedGames);
    } catch (error) {
      console.error('Failed to fetch available games:', error);
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [user?.id, startDate, endDate, showArchived]);

  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [user?.id, startDate, endDate, showArchived, fetchData]);

  useEffect(() => {
    const handleGameUpdated = (data: { gameId: string; senderId: string; game: Game; forceUpdate?: boolean }) => {
      if (!data.forceUpdate && data.senderId === user?.id) return;

      const updatedGame = data.game;

      setAvailableGames(prevAvailableGames => {
        const gameIndex = prevAvailableGames.findIndex(g => g.id === data.gameId);
        const isPublic = updatedGame.isPublic;
        const isParticipant = updatedGame.participants.some((p: any) => p.userId === user?.id);
        const isArchived = updatedGame.status === 'ARCHIVED';
        const shouldShow = isPublic || (isParticipant && !isArchived);

        if (gameIndex === -1) {
          if (shouldShow) {
            return sortGames([...prevAvailableGames, updatedGame]);
          }
          return prevAvailableGames;
        }

        if (!shouldShow) {
          return prevAvailableGames.filter(g => g.id !== data.gameId);
        }

        const updatedGames = [...prevAvailableGames];
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
    availableGames,
    loading,
    fetchData,
  };
};
