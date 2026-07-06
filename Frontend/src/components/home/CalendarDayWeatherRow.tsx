import { useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { WeatherPreviewCard } from '@/components/weather/WeatherPreviewCard';
import { useWeatherDayQuery, useWeatherPreviewQuery } from '@/queries/weather';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import {
  buildForecastWindowForDayKey,
  calendarForecastQueryRange,
} from '@/utils/calendarWeather.util';
import { calendarDayWeatherAnchor, isCalendarDayBeforeToday, weatherDayToWindow } from '@/utils/calendarDayWeather';

interface CalendarDayWeatherRowProps {
  selectedDate: Date | null;
}

export function CalendarDayWeatherRow({ selectedDate }: CalendarDayWeatherRowProps) {
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
  const managedForecast = useMemo(() => {
    if (!anchor) return null;
    if (useArchive && archiveQuery.data) return weatherDayToWindow(archiveQuery.data);
    return buildForecastWindowForDayKey(forecastQuery.data, anchor.dayKey);
  }, [anchor, archiveQuery.data, forecastQuery.data, useArchive]);
  const managedForecastPending = useArchive ? archiveQuery.isPending : forecastQuery.isPending;

  if (!selectedDate || !anchor || !cityId) {
    return null;
  }

  return (
    <div className="mb-2 flex justify-center px-1">
      <WeatherPreviewCard
        cityId={cityId}
        cityTimezone={cityTimezone}
        startTime={anchor.startTime}
        endTime={anchor.endTime}
        locale={displaySettings.locale}
        hour12={displaySettings.hour12}
        gameWindowHighlight={false}
        compact
        managedForecast={managedForecast}
        managedForecastPending={managedForecastPending}
      />
    </div>
  );
}
