import { useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useWeatherDayQuery, useWeatherPreviewQuery } from '@/queries/weather';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import {
  buildForecastWindowForDayKey,
  calendarForecastQueryRange,
} from '@/utils/calendarWeather.util';
import { calendarDayWeatherAnchor, isCalendarDayBeforeToday, weatherDayToWindow } from '@/utils/calendarDayWeather';
import type { WeatherWindow } from '@/types';

export interface CalendarDayWeatherState {
  cityId: string | null;
  cityTimezone: string | null;
  locale: string;
  hour12: boolean;
  dayKey: string | null;
  startTime: string | null;
  endTime: string | null;
  forecast: WeatherWindow | null;
  pending: boolean;
  canLoad: boolean;
}

export function useCalendarDayWeather(selectedDate: Date | null): CalendarDayWeatherState {
  const user = useAuthStore((state) => state.user);
  const cityId = user?.currentCity?.id || user?.currentCityId || null;
  const cityTimezone = user?.currentCity?.timezone ?? null;
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);

  const anchor = useMemo(
    () => (selectedDate && cityId ? calendarDayWeatherAnchor(selectedDate) : null),
    [selectedDate, cityId],
  );

  const archiveDate = useMemo(() => {
    if (!anchor) return null;
    const timezone = cityTimezone || 'UTC';
    return isCalendarDayBeforeToday(anchor.dayKey, timezone) ? anchor.dayKey : null;
  }, [anchor, cityTimezone]);

  const shouldLoad = Boolean(anchor && cityId);
  const useArchive = Boolean(archiveDate);
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
  const archiveQuery = useWeatherDayQuery(cityId ?? '', archiveDate ?? '', shouldLoad && useArchive);

  const forecast = useMemo(() => {
    if (!anchor) return null;
    if (useArchive && archiveQuery.data) return weatherDayToWindow(archiveQuery.data);
    return buildForecastWindowForDayKey(forecastQuery.data, anchor.dayKey);
  }, [anchor, archiveQuery.data, forecastQuery.data, useArchive]);

  return {
    cityId,
    cityTimezone,
    locale: displaySettings.locale,
    hour12: displaySettings.hour12,
    dayKey: anchor?.dayKey ?? null,
    startTime: anchor?.startTime ?? null,
    endTime: anchor?.endTime ?? null,
    forecast,
    pending: shouldLoad ? (useArchive ? archiveQuery.isPending : forecastQuery.isPending) : false,
    canLoad: shouldLoad,
  };
}
