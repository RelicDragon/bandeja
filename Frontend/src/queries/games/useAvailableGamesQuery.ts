import { format } from 'date-fns';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { gamesApi } from '@/api';
import type { Game } from '@/types';
import { buildAvailableGamesFilterHash, queryKeys } from '../queryKeys';
import { GAMES_LIST_STALE_TIME } from './constants';
import { sortGames } from './sortGames';

export interface AvailableGamesQueryParams {
  userId: string | undefined;
  startDate?: Date;
  endDate?: Date;
  includeLeagues?: boolean;
  sport?: string;
  showPrivateGames?: boolean;
  isAdmin?: boolean;
  cityId?: string;
}

function buildApiParams(params: AvailableGamesQueryParams) {
  const apiParams: Parameters<typeof gamesApi.getAvailableGames>[0] = {
    showArchived: true,
    includeLeagues: !!params.includeLeagues,
  };
  if (params.startDate && params.endDate) {
    apiParams.startDate = format(params.startDate, 'yyyy-MM-dd');
    apiParams.endDate = format(params.endDate, 'yyyy-MM-dd');
  }
  if (params.sport) {
    apiParams.sport = params.sport;
  }
  if (params.isAdmin && params.showPrivateGames) {
    apiParams.showPrivateGames = true;
  }
  return apiParams;
}

export function availableGamesQueryOptions(
  params: AvailableGamesQueryParams,
  enabled = true,
) {
  const filterHash = buildAvailableGamesFilterHash({
    startDate: params.startDate,
    endDate: params.endDate,
    sport: params.sport,
    includeLeagues: params.includeLeagues,
    showPrivateGames: params.showPrivateGames,
    cityId: params.cityId,
    isAdmin: params.isAdmin,
  });
  const isEnabled = enabled && !!params.userId;

  return queryOptions({
    queryKey: queryKeys.games.available(filterHash),
    queryFn: async (): Promise<Game[]> => {
      const response = await gamesApi.getAvailableGames(buildApiParams(params));
      return sortGames(response.data || []);
    },
    staleTime: GAMES_LIST_STALE_TIME,
    enabled: isEnabled,
  });
}

export function useAvailableGamesQuery(
  params: AvailableGamesQueryParams,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? !!params.userId;
  return useQuery(availableGamesQueryOptions(params, enabled));
}
