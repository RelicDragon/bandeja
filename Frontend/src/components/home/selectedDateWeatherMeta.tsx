import type { ReactNode } from 'react';
import { Wind } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { WeatherSummary } from '@/types';
import { WeatherPrecipitationInline } from '@/components/weather/WeatherPrecipitationInline';
import {
  isWeatherPrecipitationActive,
  type WeatherPrecipitationMode,
} from '@/utils/weather';

export interface SelectedDateWeatherMetaInput {
  condition: string | null;
  dayRange: { low: string; high: string } | null;
  summary: WeatherSummary | null;
  precipMode: WeatherPrecipitationMode;
  locale: string;
  t: TFunction;
}

/** Condition · range · precip(>0) · wind(>0) — no zero-noise clutter. */
export function buildSelectedDateWeatherMetaItems({
  condition,
  dayRange,
  summary,
  precipMode,
  locale,
  t,
}: SelectedDateWeatherMetaInput): ReactNode[] {
  const items: ReactNode[] = [];

  if (condition) {
    items.push(
      <span key="condition" className="font-medium text-gray-600 dark:text-gray-300">
        {condition}
      </span>,
    );
  }

  if (dayRange) {
    items.push(
      <span
        key="range"
        className="tabular-nums text-gray-500 dark:text-gray-400"
        aria-label={t('weather.dayRangeA11y', {
          low: dayRange.low,
          high: dayRange.high,
          defaultValue: '{{low}} to {{high}} degrees',
        })}
      >
        {dayRange.low}°–{dayRange.high}°
      </span>,
    );
  }

  if (summary && isWeatherPrecipitationActive(summary, precipMode)) {
    items.push(
      <WeatherPrecipitationInline
        key="precip"
        point={summary}
        mode={precipMode}
        locale={locale}
        iconSize={12}
        className="inline-flex items-center gap-0.5 text-[12px] text-gray-500 dark:text-gray-400"
      />,
    );
  }

  if (summary?.windSpeedKmh != null && summary.windSpeedKmh > 0) {
    items.push(
      <span key="wind" className="inline-flex items-center gap-0.5 text-gray-500 dark:text-gray-400">
        <Wind size={12} aria-hidden />
        {t('weather.windSpeed', { speed: Math.round(summary.windSpeedKmh) })}
      </span>,
    );
  }

  return items;
}
