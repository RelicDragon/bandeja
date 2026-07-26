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
import { GAMES_LIST_STALE_TIME, AVAILABLE_GAMES_DAY_TIMEOUT_MS } from './constants';
import { sortGamesByStartTimeAsc } from './sortGames';

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
  /** Month range: request dayIndex only (no card payload). */
  indexOnly?: boolean;
}

export function isDayScopedAvailableRange(
  startDate?: Date,
  endDate?: Date,
): boolean {
  return (
    !!startDate &&
    !!endDate &&
    format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd')
  );
}

/** Multi-day calendar range defaults to index-only unless overridden. */
export function resolveAvailableIndexOnly(params: AvailableGamesQueryParams): boolean {
  if (params.indexOnly != null) return params.indexOnly;
  if (!params.startDate || !params.endDate) return false;
  return !isDayScopedAvailableRange(params.startDate, params.endDate);
}

export function buildAvailableGamesApiParams(
  params: AvailableGamesQueryParams,
  pagination?: { take?: number; cursor?: string },
) {
  const indexOnly = resolveAvailableIndexOnly(params);
  const apiParams: Parameters<typeof gamesApi.getAvailableGames>[0] = {
    // Calendar keeps ARCHIVED so past days stay browsable on Find. Month ASC
    // truncation is handled by dayIndex badges + day-scoped selected-day fetch
    // (a single day is never flooded by other days' archive).
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
  if (indexOnly) {
    apiParams.indexOnly = true;
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
  const indexOnly = resolveAvailableIndexOnly(params);
  const filterHash = buildAvailableGamesFilterHash({
    startDate: params.startDate,
    endDate: params.endDate,
    sport: params.sport,
    includeLeagues: params.includeLeagues,
    showPrivateGames: params.showPrivateGames,
    cityId: params.cityId,
    isAdmin: params.isAdmin,
    structural: params.structural,
    indexOnly,
  });
  const isEnabled = enabled && !!params.userId;
  const queryKey = queryKeys.games.available(filterHash);
  // Day-scoped fetches must not keep previous day's rows as placeholder —
  // Find filters by selectedDay and would flash EmptyState while fetching.
  const dayScoped = isDayScopedAvailableRange(params.startDate, params.endDate);

  return queryOptions({
    queryKey,
    queryFn: async ({ client }): Promise<AvailableGamesPage> => {
      const response = await gamesApi.getAvailableGames(
        buildAvailableGamesApiParams(params),
        dayScoped ? { timeoutMs: AVAILABLE_GAMES_DAY_TIMEOUT_MS } : undefined,
      );
      const games = sortGamesByStartTimeAsc(response.data || []);
      const meta = parseMeta(response.meta);
      if (!indexOnly) {
        void attachAvailableGamesEnrichment(client, queryKey, games);
      }
      return { games, meta };
    },
    staleTime: GAMES_LIST_STALE_TIME,
    placeholderData: dayScoped ? undefined : keepPreviousData,
    enabled: isEnabled,
    // Day taps: 4s timeout + one auto-retry → Retry CTA (month keeps defaults).
    ...(dayScoped
      ? {
          retry: (failureCount: number, error: { response?: { status?: number } }) => {
            const status = error?.response?.status;
            if (typeof status === 'number' && status >= 400 && status < 500) {
              return false;
            }
            return failureCount < 1;
          },
        }
      : {}),
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
    if (resolveAvailableIndexOnly(params)) return;
    const dayScoped = isDayScopedAvailableRange(params.startDate, params.endDate);
    const response = await gamesApi.getAvailableGames(
      buildAvailableGamesApiParams(params, { cursor: current.meta.nextCursor }),
      dayScoped ? { timeoutMs: AVAILABLE_GAMES_DAY_TIMEOUT_MS } : undefined,
    );
    const incoming = sortGamesByStartTimeAsc(response.data || []);
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
