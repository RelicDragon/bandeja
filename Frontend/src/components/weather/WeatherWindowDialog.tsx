import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Droplets, Loader2, Wind } from 'lucide-react';
import type { WeatherHourlyPoint, WeatherWindow } from '@/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import {
  formatWeatherTemperature,
  formatWeatherTime,
  getForecastUpdatedLabel,
  getWeatherConditionLabel,
} from '@/utils/weather';
import { WeatherIcon } from './WeatherIcon';

interface WeatherWindowDialogProps {
  open: boolean;
  onClose: () => void;
  forecast?: WeatherWindow;
  isLoading?: boolean;
  isFullDay?: boolean;
  isFullDayLoading?: boolean;
  onShowFullDay?: () => void;
  startTime: string;
  endTime: string;
  locale: string;
  hour12: boolean;
  modalId: string;
}

function rowPhase(
  point: WeatherHourlyPoint,
  startTime: string,
  endTime: string,
  t: TFunction,
): string {
  const time = new Date(point.time).getTime();
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (time < start) return t('weather.beforeGame', { defaultValue: 'Before' });
  if (time >= end) return t('weather.afterGame', { defaultValue: 'After' });
  return t('weather.gameTime', { defaultValue: 'Game' });
}

export function WeatherWindowDialog({
  open,
  onClose,
  forecast,
  isLoading = false,
  isFullDay = false,
  isFullDayLoading = false,
  onShowFullDay,
  startTime,
  endTime,
  locale,
  hour12,
  modalId,
}: WeatherWindowDialogProps) {
  const { t } = useTranslation();
  const hasRows = Boolean(forecast?.available && forecast.hours.length > 0);
  const sortedRows = useMemo(
    () => [...(forecast?.hours ?? [])].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()),
    [forecast?.hours],
  );
  const metadata = forecast
    ? [
        forecast.cityName,
        getForecastUpdatedLabel(t, forecast.fetchedAt),
        forecast.stale ? t('weather.stale', { defaultValue: 'stale' }) : null,
      ].filter(Boolean)
    : [];
  const showFullDayButton = Boolean(hasRows && onShowFullDay && !isFullDay);

  return (
    <Dialog open={open} onClose={onClose} modalId={modalId}>
      <DialogContent className="max-w-[92vw] rounded-2xl sm:max-w-md">
        <DialogTitle className="sr-only">
          {t('weather.forecastTitle', { defaultValue: 'Game weather' })}
        </DialogTitle>

        {metadata.length > 0 ? (
          <div className="border-b border-gray-100 px-4 py-3 pr-12 text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <span className="block truncate">{metadata.join(' · ')}</span>
          </div>
        ) : null}

        <div className="max-h-[65vh] overflow-y-auto p-3">
          {isLoading ? (
            <div className="flex min-h-28 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              <Loader2 size={18} className="mr-2 animate-spin" />
              {t('weather.loading', { defaultValue: 'Loading forecast' })}
            </div>
          ) : !hasRows ? (
            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-950/50 dark:text-gray-300">
              {forecast?.unavailableReason === 'missing_city_coordinates'
                ? t('weather.missingCityCoordinates', {
                    defaultValue: 'Weather is unavailable because this city has no coordinates yet.',
                  })
                : t('weather.unavailable', {
                    defaultValue: 'Weather forecast is not available for this game time yet.',
                  })}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {sortedRows.map((point) => {
                const condition = getWeatherConditionLabel(t, point.conditionKey);
                return (
                  <div
                    key={point.time}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-1 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-200">
                      <WeatherIcon conditionKey={point.conditionKey} isDay={point.isDay} size={19} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {formatWeatherTime(point.time, locale, hour12)}
                        </span>
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          {rowPhase(point, startTime, endTime, t)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                        <span className="truncate">{condition}</span>
                        {point.precipitationProbability != null ? (
                          <span className="inline-flex items-center gap-1">
                            <Droplets size={12} />
                            {point.precipitationProbability}%
                          </span>
                        ) : null}
                        {point.windSpeedKmh != null ? (
                          <span className="inline-flex items-center gap-1">
                            <Wind size={12} />
                            {t('weather.windSpeed', {
                              speed: Math.round(point.windSpeedKmh),
                            })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-lg font-semibold tabular-nums text-gray-900 dark:text-white">
                      {formatWeatherTemperature(point, { locale })}
                    </div>
                  </div>
                );
              })}
              {showFullDayButton ? (
                <div className="pt-3">
                  <button
                    type="button"
                    onClick={onShowFullDay}
                    disabled={isFullDayLoading}
                    className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-70 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    {isFullDayLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                    {isFullDayLoading
                      ? t('weather.loadingShort', { defaultValue: 'Loading' })
                      : t('weather.showFullDay', { defaultValue: 'Show full day' })}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
