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
  placement?: 'hang' | 'inset' | 'flow';
  size?: 'sm' | 'md';
}

function areMonthCalendarWeatherPillPropsEqual(
  previous: MonthCalendarWeatherPillProps,
  next: MonthCalendarWeatherPillProps,
): boolean {
  return previous.locale === next.locale
    && previous.muted === next.muted
    && previous.selected === next.selected
    && previous.placement === next.placement
    && previous.size === next.size
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
  placement = 'hang',
  size = 'sm',
}: MonthCalendarWeatherPillProps) {
  const { t } = useTranslation();
  const { point, stale } = weather;
  const tempLabel = formatWeatherTemperature(point, { locale, compact: true });
  const temperatureColor = getWeatherTemperatureColor(point);
  const conditionLabel = getWeatherConditionLabel(t, point.conditionKey);
  const isMd = size === 'md';
  const isFlow = placement === 'flow';

  const positionClass = isFlow
    ? 'relative'
    : placement === 'inset'
      ? 'absolute bottom-1 left-1/2 -translate-x-1/2'
      : 'absolute -bottom-1.5 left-1/2 -translate-x-1/2';

  const chromeClass = isFlow
    ? 'border-0 bg-transparent shadow-none'
    : muted
      ? 'rounded-full border bg-gray-400/80 shadow-md dark:bg-gray-600/80 border-gray-500/50 dark:border-gray-500/50'
      : selected
        ? 'rounded-full border bg-white/95 shadow-md border-primary-200 dark:border-primary-700'
        : 'rounded-full border bg-sky-50 shadow-md dark:bg-sky-950/80 border-sky-200/70 dark:border-sky-700/70';

  const tempClass = isFlow
    ? `text-[8px] font-medium tabular-nums leading-none ${
        muted
          ? 'text-gray-400 dark:text-gray-500'
          : selected
            ? 'text-white/75'
            : 'text-gray-500 dark:text-gray-400'
      }`
    : `${isMd ? 'text-[10px]' : 'text-[9px]'} font-semibold tabular-nums leading-none`;

  return (
    <span
      className={`
        inline-flex items-center justify-center w-fit pointer-events-none
        ${positionClass}
        ${isFlow ? 'gap-px px-0 py-0' : isMd ? 'gap-0.5 px-1.5 py-0.5' : 'gap-0.5 px-1 py-0.5'}
        ${chromeClass}
      `}
      aria-hidden
      title={`${formatWeatherTemperature(point, { locale })} ${conditionLabel}`.trim()}
    >
      <WeatherIcon
        conditionKey={point.conditionKey}
        isDay={point.isDay}
        size={isFlow ? 9 : isMd ? 13 : 10}
        className={`shrink-0 ${isFlow ? 'opacity-70' : ''}`}
      />
      <span
        data-calendar-weather-temperature
        className={tempClass}
        style={isFlow || muted ? undefined : { color: temperatureColor.textColor }}
      >
        {tempLabel}
      </span>
      {stale ? (
        <span className="h-1 w-1 rounded-full bg-amber-400 shrink-0" aria-hidden />
      ) : null}
    </span>
  );
}, areMonthCalendarWeatherPillPropsEqual);
