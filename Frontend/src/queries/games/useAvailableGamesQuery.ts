import { format } from 'date-fns';
import { keepPreviousData, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { gamesApi } from '@/api';
import type { Game } from '@/types';
import { attachAvailableGamesEnrichment } from '@/utils/attachAvailableGamesEnrichment';
import type { FindStructuralApiParams } from '@/utils/findStructuralApiParams';
import { buildAvailableGamesFilterHash, queryKeys } from '../queryKeys';
import {
  mergeAvailableGamesPages,
  parseAvailableGamesMeta,
  structuralToApiParams,
  type AvailableGamesPage,
  type AvailableGamesPageMeta,
} from './availableGamesPage';
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
  structural?: FindStructuralApiParams;
}

export function buildAvailableGamesApiParams(
  params: AvailableGamesQueryParams,
  pagination?: { take?: number; cursor?: string },
) {
  const apiParams: Parameters<typeof gamesApi.getAvailableGames>[0] = {
    showArchived: true,
    includeLeagues: !!params.includeLeagues,
    mode: 'calendar',
    format: 'card',
    ...structuralToApiParams(params.structural),
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
  if (pagination?.take != null) apiParams.take = pagination.take;
  if (pagination?.cursor) apiParams.cursor = pagination.cursor;
  return apiParams;
}

function parseMeta(raw: unknown): AvailableGamesPageMeta {
  return parseAvailableGamesMeta(raw);
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
    structural: params.structural,
  });
  const isEnabled = enabled && !!params.userId;
  const queryKey = queryKeys.games.available(filterHash);
  // Day-scoped fetches must not keep previous day's rows as placeholder —
  // Find filters by selectedDay and would flash EmptyState while fetching.
  const dayScoped =
    !!params.startDate &&
    !!params.endDate &&
    format(params.startDate, 'yyyy-MM-dd') === format(params.endDate, 'yyyy-MM-dd');

  return queryOptions({
    queryKey,
    queryFn: async ({ client }): Promise<AvailableGamesPage> => {
      const response = await gamesApi.getAvailableGames(buildAvailableGamesApiParams(params));
      const games = sortGames(response.data || []);
      const meta = parseMeta(response.meta);
      void attachAvailableGamesEnrichment(client, queryKey, games);
      return { games, meta };
    },
    staleTime: GAMES_LIST_STALE_TIME,
    placeholderData: dayScoped ? undefined : keepPreviousData,
    enabled: isEnabled,
  });
}

export function useAvailableGamesQuery(
  params: AvailableGamesQueryParams,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? !!params.userId;
  const queryClient = useQueryClient();
  const optionsForQuery = availableGamesQueryOptions(params, enabled);
  const query = useQuery(optionsForQuery);
  const queryKey = optionsForQuery.queryKey;

  const loadMore = async () => {
    const current = query.data;
    if (!current?.meta.hasMore || !current.meta.nextCursor) return;
    const response = await gamesApi.getAvailableGames(
      buildAvailableGamesApiParams(params, { cursor: current.meta.nextCursor }),
    );
    const incoming = sortGames(response.data || []);
    const meta = parseMeta(response.meta);
    // Preserve dayIndex from the first page — later pages do not re-fetch it.
    const games = mergeAvailableGamesPages(current.games, incoming);
    const page: AvailableGamesPage = {
      games,
      meta: {
        ...meta,
        dayIndex: current.meta.dayIndex,
        dayIndexTruncated: current.meta.dayIndexTruncated,
      },
    };
    queryClient.setQueryData(queryKey, page);
    void attachAvailableGamesEnrichment(queryClient, queryKey, incoming);
  };

  return { ...query, loadMore };
}

export type { AvailableGamesPage, AvailableGamesPageMeta, Game };
