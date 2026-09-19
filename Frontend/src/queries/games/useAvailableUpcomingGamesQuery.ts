import { useCallback, useMemo, useRef } from 'react';
import { keepPreviousData, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { gamesApi } from '@/api';
import { attachAvailableGamesEnrichment } from '@/utils/attachAvailableGamesEnrichment';
import type { FindStructuralApiParams } from '@/utils/findStructuralApiParams';
import { buildAvailableUpcomingFilterHash, queryKeys } from '../queryKeys';
import {
  mergeAvailableGamesPages,
  parseAvailableGamesMeta,
  structuralToApiParams,
  type AvailableGamesPage,
  type AvailableGamesPageMeta,
} from './availableGamesPage';
import { GAMES_LIST_STALE_TIME } from './constants';
import { getAppUiLocaleForGameText } from '@/utils/gameText/appUiLocale';

export interface AvailableUpcomingGamesQueryParams {
  userId: string | undefined;
  includeLeagues?: boolean;
  sport?: string;
  showPrivateGames?: boolean;
  isAdmin?: boolean;
  cityId?: string;
  structural?: FindStructuralApiParams;
}

export function buildAvailableUpcomingApiParams(
  params: AvailableUpcomingGamesQueryParams,
  pagination?: { take?: number; cursor?: string },
) {
  const apiParams: Parameters<typeof gamesApi.getAvailableUpcomingGames>[0] = {
    includeLeagues: !!params.includeLeagues,
    mode: 'upcoming',
    format: 'card',
    ...structuralToApiParams(params.structural),
  };
  if (params.sport) {
    apiParams.sport = params.sport;
  }
  if (params.isAdmin && params.showPrivateGames) {
    apiParams.showPrivateGames = true;
  }
  if (pagination?.take != null) apiParams.take = pagination.take;
  if (pagination?.cursor) apiParams.cursor = pagination.cursor;
  return apiParams;
}

function parseMeta(raw: unknown): AvailableGamesPageMeta {
  return parseAvailableGamesMeta(raw);
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
    structural: params.structural,
    locale: getAppUiLocaleForGameText(),
  });
  const isEnabled = enabled && !!params.userId;
  const queryKey = queryKeys.games.availableUpcoming(filterHash);

  return queryOptions({
    queryKey,
    queryFn: async ({ client }): Promise<AvailableGamesPage> => {
      const response = await gamesApi.getAvailableUpcomingGames(
        buildAvailableUpcomingApiParams(params),
      );
      const games = response.data || [];
      const meta = parseMeta(response.meta);
      void attachAvailableGamesEnrichment(client, queryKey, games);
      return { games, meta };
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
  const queryClient = useQueryClient();
  const optionsForQuery = availableUpcomingGamesQueryOptions(params, enabled);
  const query = useQuery(optionsForQuery);
  const filterHash = optionsForQuery.queryKey[2];
  const queryKey = useMemo(
    () => queryKeys.games.availableUpcoming(filterHash),
    [filterHash],
  );
  const paramsRef = useRef(params);
  paramsRef.current = params;

  // Stable identity: this is threaded down to the Find section as a prop, and a
  // fresh function each render would invalidate the memoised props object.
  const loadMore = useCallback(async () => {
    const current = queryClient.getQueryData<AvailableGamesPage>(queryKey);
    if (!current?.meta.hasMore || !current.meta.nextCursor) return;
    const response = await gamesApi.getAvailableUpcomingGames(
      buildAvailableUpcomingApiParams(paramsRef.current, { cursor: current.meta.nextCursor }),
    );
    const incoming = response.data || [];
    const meta = parseMeta(response.meta);
    const games = mergeAvailableGamesPages(current.games, incoming);
    queryClient.setQueryData(queryKey, { games, meta });
    void attachAvailableGamesEnrichment(queryClient, queryKey, incoming);
  }, [queryClient, queryKey]);

  return { ...query, loadMore };
}
