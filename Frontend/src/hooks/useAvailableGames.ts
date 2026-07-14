import { useCallback } from 'react';
import { useAvailableGamesQuery } from '@/queries/games/useAvailableGamesQuery';
import type { FindStructuralApiParams } from '@/utils/findStructuralApiParams';
import { EMPTY_AVAILABLE_META } from '@/queries/games/availableGamesPage';

export function deriveAvailableGamesLoading(
  queryEnabled: boolean,
  isPending: boolean,
  isFetching: boolean,
  gamesCount: number,
): boolean {
  return queryEnabled && (isPending || (isFetching && gamesCount === 0));
}

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
  structural?: FindStructuralApiParams,
  /**
   * When true, ignore keepPreviousData so callers can fall back to month cards
   * instead of flashing the wrong day (selected-day scoped Find fetch).
   */
  rejectPlaceholderData = false,
) => {
  const { data, isPending, isFetching, isPlaceholderData, refetch, loadMore } =
    useAvailableGamesQuery(
      {
        userId: user?.id,
        startDate,
        endDate,
        includeLeagues,
        sport,
        showPrivateGames,
        isAdmin: user?.isAdmin,
        cityId: user?.currentCity?.id || user?.currentCityId,
        structural,
      },
      { enabled: queryEnabled },
    );

  const hidePlaceholder = rejectPlaceholderData && isPlaceholderData;
  const games = hidePlaceholder ? [] : (data?.games ?? []);
  const meta = hidePlaceholder ? EMPTY_AVAILABLE_META : (data?.meta ?? EMPTY_AVAILABLE_META);

  const loading = deriveAvailableGamesLoading(
    queryEnabled,
    isPending || hidePlaceholder,
    isFetching,
    games.length,
  );

  const fetchData = useCallback(
    async (_force = false) => {
      await refetch();
    },
    [refetch],
  );

  return {
    availableGames: games,
    meta,
    loading,
    isPlaceholderData,
    fetchData,
    refetch: fetchData,
    loadMore,
  };
};
