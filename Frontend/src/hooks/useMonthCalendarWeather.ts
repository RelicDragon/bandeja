import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { WeatherDay } from '@/types';
import { weatherDayQueryOptions, weatherPreviewQueryOptions } from '@/queries/weather';
import {
  buildCalendarWeatherByDay,
  splitCalendarDayKeys,
  type CalendarDayWeather,
} from '@/utils/calendarWeather.util';
import { maxForecastDayKey } from '@/utils/weatherDayGroups';

const GRID_ANCHOR_ISO = 'T12:00:00.000Z';

export interface MonthCalendarWeatherState {
  weatherByDay: Map<string, CalendarDayWeather>;
}

export function useMonthCalendarWeather(
  cityId: string | null | undefined,
  dayKeys: string[],
  enabled: boolean,
  cityTimezone?: string | null,
): MonthCalendarWeatherState {
  const resolvedCityId = cityId ?? '';
  const shouldFetch = enabled && Boolean(resolvedCityId) && dayKeys.length > 0;

  const forecastRange = useMemo(() => {
    const timezone = cityTimezone || 'UTC';
    const { todayKey } = splitCalendarDayKeys(dayKeys, timezone);
    const maxForecastDay = maxForecastDayKey(timezone);
    return {
      startTime: `${todayKey}${GRID_ANCHOR_ISO}`,
      endTime: `${maxForecastDay}${GRID_ANCHOR_ISO}`,
    };
  }, [cityTimezone, dayKeys]);

  const forecastQuery = useQuery(
    weatherPreviewQueryOptions(
      {
        cityId: resolvedCityId,
        startTime: forecastRange.startTime,
        endTime: forecastRange.endTime,
        scope: 'forecast',
      },
      shouldFetch,
    ),
  );

  const resolvedTimezone = cityTimezone || forecastQuery.data?.cityTimezone || 'UTC';

  const pastDayKeys = useMemo(
    () => splitCalendarDayKeys(dayKeys, resolvedTimezone).pastDayKeys,
    [dayKeys, resolvedTimezone],
  );

  const pastQueries = useQueries({
    queries: pastDayKeys.map((date) => weatherDayQueryOptions(resolvedCityId, date, shouldFetch)),
  });

  const weatherByDay = useMemo(() => {
    const pastDaysByKey = new Map<string, WeatherDay | undefined>();
    pastDayKeys.forEach((date, index) => {
      pastDaysByKey.set(date, pastQueries[index]?.data);
    });

    return buildCalendarWeatherByDay({
      dayKeys,
      forecastWindow: forecastQuery.data,
      pastDaysByKey,
    });
  }, [dayKeys, pastDayKeys, forecastQuery.data, pastQueries]);

  return { weatherByDay };
}
