import { useCallback } from 'react';
import { useAvailableGamesQuery } from '@/queries/games/useAvailableGamesQuery';

export const useAvailableGames = (
  user: {
    id?: string;
    isAdmin?: boolean;
    currentCity?: { id?: string };
    currentCityId?: string;
  } | null | undefined,
  startDate?: Date,
  endDate?: Date,
  includeLeagues?: boolean,
  sport?: string,
  showPrivateGames?: boolean,
  queryEnabled = true,
) => {
  const { data, isPending, isFetching, refetch } = useAvailableGamesQuery({
    userId: user?.id,
    startDate,
    endDate,
    includeLeagues,
    sport,
    showPrivateGames,
    isAdmin: user?.isAdmin,
    cityId: user?.currentCity?.id || user?.currentCityId,
  }, { enabled: queryEnabled });

  const availableGames = data ?? [];
  const loading = isPending || (isFetching && availableGames.length === 0);

  const fetchData = useCallback(
    async (_force = false) => {
      await refetch();
    },
    [refetch],
  );

  return { availableGames, loading, fetchData, refetch: fetchData };
};
