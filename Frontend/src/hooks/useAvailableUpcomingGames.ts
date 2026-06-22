import { useCallback } from 'react';
import { useAvailableUpcomingGamesQuery } from '@/queries/games/useAvailableUpcomingGamesQuery';
import { deriveAvailableGamesLoading } from '@/hooks/useAvailableGames';

export const useAvailableUpcomingGames = (
  user: {
    id?: string;
    isAdmin?: boolean;
    currentCity?: { id?: string };
    currentCityId?: string;
  } | null | undefined,
  includeLeagues?: boolean,
  sport?: string,
  showPrivateGames?: boolean,
  queryEnabled = true,
) => {
  const { data, isPending, isFetching, refetch } = useAvailableUpcomingGamesQuery({
    userId: user?.id,
    includeLeagues,
    sport,
    showPrivateGames,
    isAdmin: user?.isAdmin,
    cityId: user?.currentCity?.id || user?.currentCityId,
  }, { enabled: queryEnabled });

  const availableGames = data ?? [];
  const loading = deriveAvailableGamesLoading(
    queryEnabled,
    isPending,
    isFetching,
    availableGames.length,
  );

  const fetchData = useCallback(
    async (_force = false) => {
      await refetch();
    },
    [refetch],
  );

  return { availableGames, loading, fetchData, refetch: fetchData };
};
