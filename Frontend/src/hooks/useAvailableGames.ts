import { useState, useEffect, useCallback, useRef } from 'react';
import { gamesApi } from '@/api';
import { Game } from '@/types';
import { socketService } from '@/services/socketService';

export const useAvailableGames = (user: any, month?: number, year?: number) => {
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

    const fetchParams = `available-games-${user.id}-${month}-${year}`;

    if (!force && (isLoadingRef.current || lastFetchParamsRef.current === fetchParams)) {
      return;
    }

    isLoadingRef.current = true;
    lastFetchParamsRef.current = fetchParams;

    setLoading(true);
    try {
      const response = await gamesApi.getAvailableGames(month !== undefined && year !== undefined ? { month, year } : undefined);
      const allGames = response.data || [];

      const availableGamesFiltered = allGames.filter((game) => {
        return game.participants.length < game.maxParticipants;
      });

      const sortedGames = sortGames(availableGamesFiltered);
      setAvailableGames(sortedGames);
    } catch (error) {
      console.error('Failed to fetch available games:', error);
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [user?.id, month, year]);

  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [user?.id, month, year, fetchData]);

  useEffect(() => {
    const handleGameUpdated = (data: { gameId: string; senderId: string; game: Game; forceUpdate?: boolean }) => {
      if (!data.forceUpdate && data.senderId === user?.id) return;

      const updatedGame = data.game;

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
