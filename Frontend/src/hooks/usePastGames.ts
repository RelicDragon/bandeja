import { useState, useCallback, useRef } from 'react';
import { gamesApi } from '@/api';
import { Game } from '@/types';

export const usePastGames = (user: any) => {
  const [pastGames, setPastGames] = useState<Game[]>([]);
  const [loadingPastGames, setLoadingPastGames] = useState(false);
  const [showPastGames, setShowPastGames] = useState(false);
  const [pastGamesOffset, setPastGamesOffset] = useState(0);
  const [hasMorePastGames, setHasMorePastGames] = useState(true);

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
      
      setPastGames(prev => [...prev, ...newPastGames]);
      setPastGamesOffset(pastGamesOffset + 20);
    } catch (error) {
      console.error('Failed to load past games:', error);
    } finally {
      isLoadingRef.current = false;
      setLoadingPastGames(false);
    }
  }, [user?.currentCity?.id, user?.id, loadingPastGames, hasMorePastGames, pastGamesOffset]);

  const togglePastGames = useCallback(() => {
    setShowPastGames(!showPastGames);
    if (!showPastGames && pastGames.length === 0) {
      loadPastGames();
    }
  }, [showPastGames, pastGames.length, loadPastGames]);

  return {
    pastGames,
    loadingPastGames,
    showPastGames,
    hasMorePastGames,
    loadPastGames,
    togglePastGames,
  };
};

