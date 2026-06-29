import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudSun, Droplets, Loader2, Wind } from 'lucide-react';
import { useWeatherPreviewQuery } from '@/queries/weather';
import {
  formatWeatherTemperature,
  getForecastUpdatedLabel,
  getWeatherTemperatureColor,
  getWeatherConditionLabel,
} from '@/utils/weather';
import { WeatherIcon } from './WeatherIcon';
import { WeatherWindowDialog } from './WeatherWindowDialog';
import { getWeatherIconPalette } from './weatherIconPalette';
import { areWeatherPreviewCardPropsEqual } from './weatherPreviewCardMemo';

export interface WeatherPreviewCardProps {
  cityId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  enabled?: boolean;
  locale: string;
  hour12: boolean;
}

function WeatherPreviewCardInner({
  cityId,
  startTime,
  endTime,
  enabled = true,
  locale,
  hour12,
}: WeatherPreviewCardProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fullDayRequested, setFullDayRequested] = useState(false);
  const shouldLoad = enabled && Boolean(cityId && startTime && endTime);
  const previewParams = useMemo(() => ({ cityId, startTime, endTime }), [cityId, endTime, startTime]);
  const fullDayParams = useMemo(
    () => ({ cityId, startTime, endTime, scope: 'day' as const }),
    [cityId, endTime, startTime],
  );
  const query = useWeatherPreviewQuery(previewParams, shouldLoad);
  const fullDayQuery = useWeatherPreviewQuery(
    fullDayParams,
    dialogOpen && fullDayRequested,
  );
  const handleOpenDialog = useCallback(() => setDialogOpen(true), []);
  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setFullDayRequested(false);
  }, []);
  const handleShowFullDay = useCallback(() => setFullDayRequested(true), []);

  if (!shouldLoad) return null;

  const forecast = query.data;
  const summary = forecast?.summary;
  const condition = summary ? getWeatherConditionLabel(t, summary.conditionKey) : null;
  const temperatureColor = summary ? getWeatherTemperatureColor(summary) : null;
  const iconPalette = summary ? getWeatherIconPalette(summary.conditionKey, summary.isDay) : null;
  const canOpen = Boolean(forecast && !query.isPending);
  const cardClassName =
    'w-full rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-3 text-left shadow-sm transition-all duration-200 dark:border-sky-800/50 dark:from-sky-950/40 dark:via-gray-950 dark:to-emerald-950/30';
  const content = (
    <>
      {query.isPending ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 size={16} className="animate-spin" />
          {t('weather.loading', { defaultValue: 'Loading forecast' })}
        </div>
      ) : summary ? (
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-sm"
            style={iconPalette
              ? {
                  backgroundColor: iconPalette.surfaceColor,
                  borderColor: iconPalette.borderColor,
                }
              : undefined}
          >
            <WeatherIcon conditionKey={summary.conditionKey} isDay={summary.isDay} size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="text-lg font-semibold tabular-nums"
                style={temperatureColor ? { color: temperatureColor.textColor } : undefined}
              >
                {formatWeatherTemperature(summary, { locale })}
              </span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{condition}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              {summary.precipitationProbability != null ? (
                <span
                  className={`inline-flex items-center gap-1 ${
                    summary.precipitationProbability > 0
                      ? 'font-medium text-sky-600 dark:text-sky-300'
                      : ''
                  }`}
                >
                  <Droplets size={13} />
                  {summary.precipitationProbability}%
                </span>
              ) : null}
              {summary.windSpeedKmh != null ? (
                <span className="inline-flex items-center gap-1">
                  <Wind size={13} />
                  {t('weather.windSpeed', {
                    speed: Math.round(summary.windSpeedKmh),
                  })}
                </span>
              ) : null}
              <span>{getForecastUpdatedLabel(t, summary.fetchedAt)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <CloudSun size={17} />
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
          className={`${cardClassName} cursor-pointer hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md dark:hover:border-sky-700`}
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
      {dialogOpen && startTime && endTime ? (
        <WeatherWindowDialog
          open={dialogOpen}
          onClose={handleCloseDialog}
          forecast={fullDayQuery.data ?? forecast}
          isLoading={query.isPending}
          isFullDay={Boolean(fullDayQuery.data)}
          isFullDayLoading={fullDayRequested && fullDayQuery.isPending}
          onShowFullDay={handleShowFullDay}
          startTime={startTime}
          endTime={endTime}
          locale={locale}
          hour12={hour12}
          modalId={`weather-preview-${cityId ?? 'city'}-${startTime}`}
        />
      ) : null}
    </>
  );
}

export const WeatherPreviewCard = memo(WeatherPreviewCardInner, areWeatherPreviewCardPropsEqual);
