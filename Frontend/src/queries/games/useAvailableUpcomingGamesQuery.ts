import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import { gamesApi } from '@/api';
import type { Game } from '@/types';
import { buildAvailableUpcomingFilterHash, queryKeys } from '../queryKeys';
import { GAMES_LIST_STALE_TIME } from './constants';

export interface AvailableUpcomingGamesQueryParams {
  userId: string | undefined;
  includeLeagues?: boolean;
  sport?: string;
  showPrivateGames?: boolean;
  isAdmin?: boolean;
  cityId?: string;
}

function buildApiParams(params: AvailableUpcomingGamesQueryParams) {
  const apiParams: Parameters<typeof gamesApi.getAvailableUpcomingGames>[0] = {
    includeLeagues: !!params.includeLeagues,
  };
  if (params.sport) {
    apiParams.sport = params.sport;
  }
  if (params.isAdmin && params.showPrivateGames) {
    apiParams.showPrivateGames = true;
  }
  return apiParams;
}

export function availableUpcomingGamesQueryOptions(
  params: AvailableUpcomingGamesQueryParams,
  enabled = true,
) {
  const filterHash = buildAvailableUpcomingFilterHash({
    sport: params.sport,
    includeLeagues: params.includeLeagues,
    showPrivateGames: params.showPrivateGames,
    cityId: params.cityId,
    isAdmin: params.isAdmin,
  });
  const isEnabled = enabled && !!params.userId;

  return queryOptions({
    queryKey: queryKeys.games.availableUpcoming(filterHash),
    queryFn: async (): Promise<Game[]> => {
      const response = await gamesApi.getAvailableUpcomingGames(buildApiParams(params));
      return response.data || [];
    },
    staleTime: GAMES_LIST_STALE_TIME,
    placeholderData: keepPreviousData,
    enabled: isEnabled,
  });
}

export function useAvailableUpcomingGamesQuery(
  params: AvailableUpcomingGamesQueryParams,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? !!params.userId;
  return useQuery(availableUpcomingGamesQueryOptions(params, enabled));
}
