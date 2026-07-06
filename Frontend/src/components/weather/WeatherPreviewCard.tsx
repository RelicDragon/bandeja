import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudSun, Loader2, Wind } from 'lucide-react';
import { useWeatherDayQuery, useWeatherPreviewQuery } from '@/queries/weather';
import type { WeatherWindowScope } from '@/api/weather';
import type { WeatherWindow } from '@/types';
import {
  formatWeatherTemperature,
  getForecastUpdatedLabel,
  getWeatherTemperatureColor,
  getWeatherConditionLabel,
  hasWeatherPrecipitation,
  resolveWeatherPrecipitationMode,
} from '@/utils/weather';
import { WeatherIcon } from './WeatherIcon';
import { WeatherWindowDialog } from './WeatherWindowDialog';
import { WeatherPrecipitationInline } from './WeatherPrecipitationInline';
import { getWeatherIconPalette } from './weatherIconPalette';
import { areWeatherPreviewCardPropsEqual } from './weatherPreviewCardMemo';
import { formatWeatherDayRangeCompact, summarizeDayTemperatureRange } from '@/utils/weatherDayGroups';
import { weatherDayToWindow } from '@/utils/calendarDayWeather';

export interface WeatherPreviewCardProps {
  cityId?: string | null;
  cityTimezone?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  enabled?: boolean;
  locale: string;
  hour12: boolean;
  gameWindowHighlight?: boolean;
  compact?: boolean;
  scope?: WeatherWindowScope;
  archiveDate?: string | null;
  managedForecast?: WeatherWindow | null;
  managedForecastPending?: boolean;
}

function WeatherPreviewCardInner({
  cityId,
  cityTimezone,
  startTime,
  endTime,
  enabled = true,
  locale,
  hour12,
  gameWindowHighlight = true,
  compact = false,
  scope = 'game',
  archiveDate = null,
  managedForecast = undefined,
  managedForecastPending = undefined,
}: WeatherPreviewCardProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const shouldLoad = enabled && Boolean(cityId && startTime && endTime);
  const usesManagedForecast = managedForecastPending !== undefined;
  const useArchive = Boolean(archiveDate && cityId);
  const previewParams = useMemo(
    () => ({ cityId, startTime, endTime, scope }),
    [cityId, endTime, scope, startTime],
  );
  const previewQuery = useWeatherPreviewQuery(
    previewParams,
    shouldLoad && !useArchive && !usesManagedForecast,
  );
  const archiveQuery = useWeatherDayQuery(
    cityId ?? '',
    archiveDate ?? '',
    shouldLoad && useArchive && !usesManagedForecast,
  );
  const query = useArchive ? archiveQuery : previewQuery;
  const fetchedForecast = useMemo(
    () => (useArchive && archiveQuery.data ? weatherDayToWindow(archiveQuery.data) : previewQuery.data),
    [archiveQuery.data, previewQuery.data, useArchive],
  );
  const forecast = usesManagedForecast ? (managedForecast ?? null) : fetchedForecast;
  const isForecastPending = usesManagedForecast ? Boolean(managedForecastPending) : query.isPending;
  const dayRange = useMemo(() => {
    if (!compact || !forecast?.hours?.length) return null;
    const range = summarizeDayTemperatureRange(forecast.hours);
    return range ? formatWeatherDayRangeCompact(range, locale) : null;
  }, [compact, forecast?.hours, locale]);
  const handleOpenDialog = useCallback(() => setDialogOpen(true), []);
  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
  }, []);

  if (!shouldLoad) return null;

  const summary = forecast?.summary;
  const precipMode = resolveWeatherPrecipitationMode(forecast?.source);
  const condition = summary ? getWeatherConditionLabel(t, summary.conditionKey) : null;
  const temperatureColor = summary ? getWeatherTemperatureColor(summary) : null;
  const iconPalette = summary ? getWeatherIconPalette(summary.conditionKey, summary.isDay) : null;
  const canOpen = Boolean(forecast && !isForecastPending);
  const cardClassName = compact
    ? 'w-fit max-w-full rounded-lg border border-sky-200/70 bg-sky-50/80 px-2.5 py-2 text-left shadow-sm transition-colors duration-200 dark:border-sky-800/40 dark:bg-sky-950/30'
    : 'w-full rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-3 text-left shadow-sm transition-all duration-200 dark:border-sky-800/50 dark:from-sky-950/40 dark:via-gray-950 dark:to-emerald-950/30';
  const content = (
    <>
      {isForecastPending ? (
        <div className={`flex items-center gap-2 text-gray-500 dark:text-gray-400 ${compact ? 'text-xs' : 'text-sm'}`}>
          <Loader2 size={compact ? 14 : 16} className="animate-spin" />
          {t('weather.loading', { defaultValue: 'Loading forecast' })}
        </div>
      ) : summary ? (
        <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
          <div
            className={`flex shrink-0 items-center justify-center rounded-lg border shadow-sm ${
              compact ? 'h-8 w-8' : 'h-11 w-11 rounded-xl'
            }`}
            style={iconPalette
              ? {
                  backgroundColor: iconPalette.surfaceColor,
                  borderColor: iconPalette.borderColor,
                }
              : undefined}
          >
            <WeatherIcon conditionKey={summary.conditionKey} isDay={summary.isDay} size={compact ? 16 : 22} />
          </div>
          <div className={compact ? 'min-w-0' : 'min-w-0 flex-1'}>
            {compact ? (
              <>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0">
                  <span
                    className="text-base font-semibold tabular-nums"
                    style={temperatureColor ? { color: temperatureColor.textColor } : undefined}
                  >
                    {formatWeatherTemperature(summary, { locale })}
                  </span>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{condition}</span>
                </div>
                {dayRange || hasWeatherPrecipitation(summary, precipMode) || summary.windSpeedKmh != null ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {dayRange ? (
                      <span
                        className="inline-flex items-baseline rounded-md bg-white/70 px-1.5 py-0.5 text-[11px] tabular-nums ring-1 ring-sky-200/60 dark:bg-gray-900/50 dark:ring-sky-800/40"
                        aria-label={t('weather.dayRangeA11y', {
                          low: dayRange.low,
                          high: dayRange.high,
                          defaultValue: '{{low}} to {{high}} degrees',
                        })}
                      >
                        <span className="text-gray-500 dark:text-gray-400">{dayRange.low}°</span>
                        <span className="px-0.5 text-gray-300 dark:text-gray-600" aria-hidden>
                          –
                        </span>
                        <span className="font-medium text-gray-700 dark:text-gray-200">{dayRange.high}°</span>
                      </span>
                    ) : null}
                    {hasWeatherPrecipitation(summary, precipMode) || summary.windSpeedKmh != null ? (
                      <span className="inline-flex items-center gap-2">
                        <WeatherPrecipitationInline
                          point={summary}
                          mode={precipMode}
                          locale={locale}
                          iconSize={11}
                        />
                        {summary.windSpeedKmh != null ? (
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                            <Wind size={11} />
                            {t('weather.windSpeed', {
                              speed: Math.round(summary.windSpeedKmh),
                            })}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span
                    className="text-lg font-semibold tabular-nums"
                    style={temperatureColor ? { color: temperatureColor.textColor } : undefined}
                  >
                    {formatWeatherTemperature(summary, { locale })}
                  </span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{condition}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <WeatherPrecipitationInline
                    point={summary}
                    mode={precipMode}
                    locale={locale}
                    iconSize={13}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
                  />
                  {summary.windSpeedKmh != null ? (
                    <span className="inline-flex items-center gap-1">
                      <Wind size={13} />
                      {t('weather.windSpeed', {
                        speed: Math.round(summary.windSpeedKmh),
                      })}
                    </span>
                  ) : null}
                  <span>
                    {getForecastUpdatedLabel(t, summary.fetchedAt)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className={`flex items-center gap-2 text-gray-500 dark:text-gray-400 ${compact ? 'text-xs' : 'text-sm'}`}>
          <CloudSun size={compact ? 15 : 17} />
          {forecast?.unavailableReason === 'missing_city_coordinates'
            ? t('weather.missingCityCoordinates', {
                defaultValue: 'Weather is unavailable because this city has no coordinates yet.',
              })
            : t('weather.unavailableShort', {
                defaultValue: 'Forecast is not available for this time yet.',
              })}
        </div>
      )}
    </>
  );

  return (
    <>
      {canOpen ? (
        <button
          type="button"
          className={`${cardClassName} cursor-pointer ${
            compact
              ? 'hover:border-sky-300 hover:bg-sky-50 dark:hover:border-sky-700 dark:hover:bg-sky-950/50'
              : 'hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md dark:hover:border-sky-700'
          }`}
          onClick={handleOpenDialog}
          aria-label={t('weather.openForecast', {
            condition: condition ?? '',
            temperature: summary ? formatWeatherTemperature(summary, { locale }) : '',
            defaultValue: 'Open weather forecast: {{temperature}}, {{condition}}',
          })}
        >
          {content}
        </button>
      ) : (
        <div className={cardClassName}>
          {content}
        </div>
      )}
      {shouldLoad ? (
        <WeatherWindowDialog
          open={dialogOpen}
          onClose={handleCloseDialog}
          cityId={cityId!}
          cityTimezone={cityTimezone ?? undefined}
          startTime={startTime!}
          endTime={endTime!}
          locale={locale}
          hour12={hour12}
          modalId={`weather-preview-${cityId ?? 'city'}-${startTime}`}
          gameWindowHighlight={gameWindowHighlight}
        />
      ) : null}
    </>
  );
}

export const WeatherPreviewCard = memo(WeatherPreviewCardInner, areWeatherPreviewCardPropsEqual);
