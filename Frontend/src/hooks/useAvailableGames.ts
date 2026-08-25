import { useCallback } from 'react';
import { useAvailableGamesQuery } from '@/queries/games/useAvailableGamesQuery';
import type { Game } from '@/types';
import type { FindStructuralApiParams } from '@/utils/findStructuralApiParams';
import { EMPTY_AVAILABLE_META } from '@/queries/games/availableGamesPage';

export function deriveAvailableGamesLoading(
  queryEnabled: boolean,
  isPending: boolean,
  isFetching: boolean,
  hasData: boolean,
): boolean {
  return queryEnabled && (isPending || (isFetching && !hasData));
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
   * When true, ignore keepPreviousData so callers can fall back while the day
   * key resolves (selected-day scoped Find fetch).
   */
  rejectPlaceholderData = false,
  indexOnly?: boolean,
) => {
  const { data, isPending, isFetching, isPlaceholderData, isError, refetch, loadMore } =
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
        indexOnly,
      },
      { enabled: queryEnabled },
    );

  const hidePlaceholder = rejectPlaceholderData && isPlaceholderData;
  const games: Game[] = hidePlaceholder ? [] : (data?.games ?? []);
  const meta = hidePlaceholder ? EMPTY_AVAILABLE_META : (data?.meta ?? EMPTY_AVAILABLE_META);
  const hasData = !hidePlaceholder && data != null;

  const loading = deriveAvailableGamesLoading(
    queryEnabled,
    isPending || hidePlaceholder,
    isFetching,
    hasData,
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
    /** Settled page only — never keepPreviousData placeholders (unsafe to seed from). */
    page: hidePlaceholder || isPlaceholderData ? undefined : data,
    loading,
    isError: queryEnabled && isError,
    isPlaceholderData,
    isFetching,
    fetchData,
    refetch: fetchData,
    loadMore,
  };
};
