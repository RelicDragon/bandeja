import { useState, useEffect, useCallback, useRef } from 'react';
import { gamesApi } from '@/api';
import { Game } from '@/types';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { format } from 'date-fns';

export const useAvailableGames = (user: any, startDate?: Date, endDate?: Date, includeLeagues?: boolean) => {
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
      ? `available-games-${user.id}-${format(startDate, 'yyyy-MM-dd')}-${format(endDate, 'yyyy-MM-dd')}-${includeLeagues}`
      : `available-games-${user.id}-${includeLeagues}`;

    if (!force && (isLoadingRef.current || lastFetchParamsRef.current === fetchParams)) {
      return;
    }

    isLoadingRef.current = true;
    lastFetchParamsRef.current = fetchParams;

    setLoading(true);
    try {
      const params: any = {
        showArchived: true,
        includeLeagues: !!includeLeagues,
      };
      if (startDate && endDate) {
        params.startDate = format(startDate, 'yyyy-MM-dd');
        params.endDate = format(endDate, 'yyyy-MM-dd');
      }
      const response = await gamesApi.getAvailableGames(params);
      const allGames = response.data || [];

      const sortedGames = sortGames(allGames);
      setAvailableGames(sortedGames);
    } catch (error) {
      console.error('Failed to fetch available games:', error);
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [user?.id, startDate, endDate, includeLeagues]);

  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [user?.id, startDate, endDate, fetchData]);

  const lastGameUpdate = useSocketEventsStore((state) => state.lastGameUpdate);

  useEffect(() => {
    if (!lastGameUpdate || (!lastGameUpdate.forceUpdate && lastGameUpdate.senderId === user?.id)) return;

    const data = lastGameUpdate;
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
  }, [lastGameUpdate, user?.id]);

  return {
    availableGames,
    loading,
    fetchData,
  };
};
