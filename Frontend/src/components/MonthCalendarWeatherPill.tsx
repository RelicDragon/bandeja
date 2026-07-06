import { useTranslation } from 'react-i18next';
import { memo } from 'react';
import { formatWeatherTemperature, getWeatherConditionLabel, getWeatherTemperatureColor } from '@/utils/weather';
import { WeatherIcon } from '@/components/weather/WeatherIcon';
import type { CalendarDayWeather } from '@/utils/calendarWeather.util';

interface MonthCalendarWeatherPillProps {
  weather: CalendarDayWeather;
  locale: string;
  muted?: boolean;
  selected?: boolean;
}

function areMonthCalendarWeatherPillPropsEqual(
  previous: MonthCalendarWeatherPillProps,
  next: MonthCalendarWeatherPillProps,
): boolean {
  return previous.locale === next.locale
    && previous.muted === next.muted
    && previous.selected === next.selected
    && previous.weather.point.time === next.weather.point.time
    && previous.weather.point.temperatureC === next.weather.point.temperatureC
    && previous.weather.point.conditionKey === next.weather.point.conditionKey
    && previous.weather.point.isDay === next.weather.point.isDay
    && previous.weather.stale === next.weather.stale;
}

export const MonthCalendarWeatherPill = memo(function MonthCalendarWeatherPill({
  weather,
  locale,
  muted = false,
  selected = false,
}: MonthCalendarWeatherPillProps) {
  const { t } = useTranslation();
  const { point, stale } = weather;
  const tempLabel = formatWeatherTemperature(point, { locale, compact: true });
  const temperatureColor = getWeatherTemperatureColor(point);
  const conditionLabel = getWeatherConditionLabel(t, point.conditionKey);

  return (
    <span
      className={`
        absolute -bottom-1.5 left-1/2 -translate-x-1/2
        inline-flex items-center justify-center
        gap-0.5 px-1 py-0.5 rounded-full w-fit
        border shadow-md pointer-events-none
        ${muted
          ? 'bg-gray-400/80 dark:bg-gray-600/80 border-gray-500/50 dark:border-gray-500/50'
          : selected
          ? 'bg-white/95 border-primary-200 dark:border-primary-700'
          : 'bg-sky-50 dark:bg-sky-950/80 border-sky-200/70 dark:border-sky-700/70'
        }
      `}
      aria-hidden
      title={`${formatWeatherTemperature(point, { locale })} ${conditionLabel}`.trim()}
    >
      <WeatherIcon
        conditionKey={point.conditionKey}
        isDay={point.isDay}
        size={10}
        className="shrink-0"
      />
      <span
        className="text-[9px] font-semibold tabular-nums leading-none"
        style={{ color: muted ? undefined : temperatureColor.textColor }}
      >
        {tempLabel}
      </span>
      {stale ? (
        <span className="h-1 w-1 rounded-full bg-amber-400 shrink-0" aria-hidden />
      ) : null}
    </span>
  );
}, areMonthCalendarWeatherPillPropsEqual);
