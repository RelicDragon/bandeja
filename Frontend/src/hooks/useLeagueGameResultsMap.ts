import { useEffect, useState } from 'react';
import { resultsApi, type RoundData } from '@/api/results';
import type { Game } from '@/types';

export function useLeagueGameResultsMap(games: Game[]): Map<string, RoundData[] | null> {
  const [gameResultsMap, setGameResultsMap] = useState<Map<string, RoundData[] | null>>(
    () => new Map()
  );

  useEffect(() => {
    if (games.length === 0) {
      setGameResultsMap(new Map());
      return;
    }

    let cancelled = false;

    const run = async () => {
      const resultsMap = new Map<string, RoundData[] | null>();
      for (const game of games) {
        if (game.resultsStatus === 'NONE') {
          resultsMap.set(game.id, null);
          continue;
        }
        try {
          const response = await resultsApi.getGameResults(game.id);
          const rounds = response.data?.rounds ?? [];
          resultsMap.set(game.id, rounds.length > 0 ? rounds : null);
        } catch {
          resultsMap.set(game.id, null);
        }
      }
      if (!cancelled) setGameResultsMap(resultsMap);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [games]);

  return gameResultsMap;
}
