import { format, startOfDay } from 'date-fns';
import type { QueryClient } from '@tanstack/react-query';
import type { Game } from '@/types';
import { dateKeyInTimezone } from '@/utils/weatherDayGroups';
import { buildAvailableGamesFilterHash, queryKeys } from '../queryKeys';
import type { AvailableGamesPage } from './availableGamesPage';
import type { AvailableGamesQueryParams } from './useAvailableGamesQuery';
import { AVAILABLE_GAMES_DAY_TAKE } from './constants';

function gameDayKey(startTime: string, cityTimezone?: string | null): string {
  if (cityTimezone) return dateKeyInTimezone(new Date(startTime), cityTimezone);
  return format(startOfDay(new Date(startTime)), 'yyyy-MM-dd');
}

export type DaySeedRange = {
  /** Inclusive yyyy-MM-dd — month (or padded) query window that produced the page. */
  startKey: string;
  endKey: string;
};

/**
 * When month page still has cards that fully cover a day (per dayIndex), return
 * those cards so the day-scoped query key can be seeded without a GET.
 * Returns [] when dayIndex confirms the day is empty (and day is inside range).
 * Returns null when unsafe / incomplete / out of range (caller should fetch).
 */
export function resolveDaySeedFromMonthPage(
  monthPage: AvailableGamesPage,
  dayKey: string,
  cityTimezone: string | null | undefined,
  monthRange: DaySeedRange,
): Game[] | null {
  // Never invent emptiness for days the month index did not cover (e.g. D±1
  // outside the visible padded month → would sticky-cache a false empty).
  if (dayKey < monthRange.startKey || dayKey > monthRange.endKey) {
    return null;
  }

  const dayIndex = monthPage.meta.dayIndex;
  if (!dayIndex) {
    if (monthPage.meta.hasMore || monthPage.meta.truncated) return null;
    if (monthPage.games.length === 0) return null;
    return monthPage.games.filter((g) => gameDayKey(g.startTime, cityTimezone) === dayKey);
  }

  if (monthPage.meta.dayIndexTruncated) return null;

  const indexIdsForDay = dayIndex
    .filter((row) => (row.dateKey ?? gameDayKey(row.startTime, cityTimezone)) === dayKey)
    .map((row) => row.id);

  if (indexIdsForDay.length === 0) return [];

  if (monthPage.games.length === 0) return null;

  const dayGames = monthPage.games.filter(
    (g) => gameDayKey(g.startTime, cityTimezone) === dayKey,
  );
  const cardIds = new Set(dayGames.map((g) => g.id));
  if (indexIdsForDay.some((id) => !cardIds.has(id))) return null;

  return dayGames;
}

export function dayScopedQueryParams(
  base: AvailableGamesQueryParams,
  day: Date,
): AvailableGamesQueryParams {
  return {
    ...base,
    startDate: day,
    endDate: day,
    indexOnly: false,
  };
}

export function monthSeedRangeFromParams(
  params: Pick<AvailableGamesQueryParams, 'startDate' | 'endDate'>,
): DaySeedRange | null {
  if (!params.startDate || !params.endDate) return null;
  return {
    startKey: format(params.startDate, 'yyyy-MM-dd'),
    endKey: format(params.endDate, 'yyyy-MM-dd'),
  };
}

/**
 * Seed day-scoped cache from month page when safe. No-op if day key already has data
 * or coverage is incomplete.
 */
export function seedDayScopedAvailableCache(
  queryClient: QueryClient,
  monthPage: AvailableGamesPage | undefined,
  dayParams: AvailableGamesQueryParams,
  cityTimezone: string | null | undefined,
  monthRange: DaySeedRange,
): boolean {
  if (!monthPage || !dayParams.startDate || !dayParams.userId) return false;
  const dayKey = format(dayParams.startDate, 'yyyy-MM-dd');
  const seeded = resolveDaySeedFromMonthPage(monthPage, dayKey, cityTimezone, monthRange);
  if (seeded == null) return false;

  const filterHash = buildAvailableGamesFilterHash({
    startDate: dayParams.startDate,
    endDate: dayParams.endDate,
    sport: dayParams.sport,
    includeLeagues: dayParams.includeLeagues,
    showPrivateGames: dayParams.showPrivateGames,
    cityId: dayParams.cityId,
    isAdmin: dayParams.isAdmin,
    structural: dayParams.structural,
    indexOnly: false,
  });
  const queryKey = queryKeys.games.available(filterHash);
  if (queryClient.getQueryData(queryKey) != null) return false;

  const page: AvailableGamesPage = {
    games: seeded,
    meta: {
      take: AVAILABLE_GAMES_DAY_TAKE,
      bound: 300,
      hasMore: false,
      nextCursor: null,
      truncated: false,
    },
  };
  queryClient.setQueryData(queryKey, page);
  return true;
}
