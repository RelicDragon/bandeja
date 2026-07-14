import { useCallback } from 'react';
import { useAvailableUpcomingGamesQuery } from '@/queries/games/useAvailableUpcomingGamesQuery';
import { deriveAvailableGamesLoading } from '@/hooks/useAvailableGames';
import type { FindStructuralApiParams } from '@/utils/findStructuralApiParams';
import { EMPTY_AVAILABLE_META } from '@/queries/games/availableGamesPage';

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
  structural?: FindStructuralApiParams,
) => {
  const { data, isPending, isFetching, refetch, loadMore } = useAvailableUpcomingGamesQuery(
    {
      userId: user?.id,
      includeLeagues,
      sport,
      showPrivateGames,
      isAdmin: user?.isAdmin,
      cityId: user?.currentCity?.id || user?.currentCityId,
      structural,
    },
    { enabled: queryEnabled },
  );

  const availableGames = data?.games ?? [];
  const meta = data?.meta ?? EMPTY_AVAILABLE_META;
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

  return {
    availableGames,
    meta,
    loading,
    fetchData,
    refetch: fetchData,
    loadMore,
  };
};
