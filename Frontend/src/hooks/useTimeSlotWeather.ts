import { useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useWeatherDayQuery, useWeatherPreviewQuery } from '@/queries/weather';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';
import { calendarDayKey } from '@/utils/calendarSelectedDayFilter';
import {
  buildForecastWindowForDayKey,
  buildTimeSlotWeatherByTime,
  calendarForecastQueryRange,
  type CalendarDayWeather,
} from '@/utils/calendarWeather.util';
import { isCalendarDayBeforeToday } from '@/utils/calendarDayWeather';
import type { Club } from '@/types';

export function useTimeSlotWeather({
  club,
  selectedDate,
  times,
  enabled = true,
}: {
  club?: Club;
  selectedDate: Date;
  times: string[];
  enabled?: boolean;
}): { weatherByTime: Map<string, CalendarDayWeather> } {
  const user = useAuthStore((state) => state.user);
  const cityId = club?.cityId ?? user?.currentCity?.id ?? user?.currentCityId ?? null;
  const cityTimezone = club?.city?.timezone ?? user?.currentCity?.timezone ?? getClubTimezone(club);
  const dayKey = calendarDayKey(selectedDate);
  const useArchive = isCalendarDayBeforeToday(dayKey, cityTimezone);
  const shouldLoad = enabled && Boolean(cityId) && times.length > 0;

  const forecastRange = useMemo(() => calendarForecastQueryRange(cityTimezone), [cityTimezone]);
  const forecastQuery = useWeatherPreviewQuery(
    {
      cityId,
      startTime: forecastRange.startTime,
      endTime: forecastRange.endTime,
      scope: 'forecast',
    },
    shouldLoad && !useArchive,
  );
  const archiveQuery = useWeatherDayQuery(cityId ?? '', dayKey, shouldLoad && useArchive);

  const weatherByTime = useMemo(() => {
    if (!cityId) return new Map<string, CalendarDayWeather>();

    if (useArchive) {
      if (!archiveQuery.data?.available || archiveQuery.data.hours.length === 0) {
        return new Map<string, CalendarDayWeather>();
      }
      return buildTimeSlotWeatherByTime({
        times,
        hours: archiveQuery.data.hours,
        timezone: archiveQuery.data.cityTimezone || cityTimezone,
        stale: archiveQuery.data.stale,
      });
    }

    const dayWindow = buildForecastWindowForDayKey(forecastQuery.data, dayKey);
    if (!dayWindow?.available || dayWindow.hours.length === 0) {
      return new Map<string, CalendarDayWeather>();
    }

    return buildTimeSlotWeatherByTime({
      times,
      hours: dayWindow.hours,
      timezone: dayWindow.cityTimezone || cityTimezone,
      stale: dayWindow.stale,
    });
  }, [
    archiveQuery.data,
    cityId,
    cityTimezone,
    dayKey,
    forecastQuery.data,
    times,
    useArchive,
  ]);

  return { weatherByTime };
}
