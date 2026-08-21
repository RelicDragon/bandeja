import { addDays } from 'date-fns';
import type { QueryClient } from '@tanstack/react-query';
import type { AvailableGamesPage } from './availableGamesPage';
import type { AvailableGamesQueryParams } from './useAvailableGamesQuery';
import { availableGamesQueryOptions } from './useAvailableGamesQuery';
import {
  dayScopedQueryParams,
  seedDayScopedAvailableCache,
  type DaySeedRange,
} from './seedDayScopedAvailableCache';

export function prefetchFindNeighborDays(
  queryClient: QueryClient,
  calendarQueryParams: AvailableGamesQueryParams,
  selectedDayDate: Date,
  calendarPage: AvailableGamesPage | undefined,
  cityTimezone: string | null | undefined,
  monthSeedRange: DaySeedRange,
): void {
  for (const delta of [-1, 1] as const) {
    const dayParams = dayScopedQueryParams(calendarQueryParams, addDays(selectedDayDate, delta));
    if (calendarPage) {
      seedDayScopedAvailableCache(
        queryClient,
        calendarPage,
        dayParams,
        cityTimezone,
        monthSeedRange,
      );
    }
    void queryClient.prefetchQuery({
      ...availableGamesQueryOptions(dayParams, true),
      cancelRefetch: false,
    });
  }
}
