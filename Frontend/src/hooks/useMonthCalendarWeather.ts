import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { WeatherDay } from '@/types';
import { weatherDayQueryOptions, weatherPreviewQueryOptions } from '@/queries/weather';
import {
  buildCalendarWeatherByDay,
  calendarForecastQueryRange,
  splitCalendarDayKeys,
  type CalendarDayWeather,
} from '@/utils/calendarWeather.util';

// useQueries returns a fresh results array; combine preserves unchanged data.
const combinePastWeather = (results: { data?: WeatherDay }[]) => results.map((result) => result.data);

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

  const forecastRange = useMemo(
    () => calendarForecastQueryRange(cityTimezone),
    [cityTimezone],
  );

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

  const pastDays = useQueries({
    queries: pastDayKeys.map((date) => weatherDayQueryOptions(resolvedCityId, date, shouldFetch)),
    combine: combinePastWeather,
  });

  const weatherByDay = useMemo(() => {
    const pastDaysByKey = new Map<string, WeatherDay | undefined>();
    pastDayKeys.forEach((date, index) => {
      pastDaysByKey.set(date, pastDays[index]);
    });

    return buildCalendarWeatherByDay({
      dayKeys,
      forecastWindow: forecastQuery.data,
      pastDaysByKey,
    });
  }, [dayKeys, pastDayKeys, forecastQuery.data, pastDays]);

  return { weatherByDay };
}
