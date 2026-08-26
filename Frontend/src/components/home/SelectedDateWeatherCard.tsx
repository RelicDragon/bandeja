import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCalendarDayWeather } from '@/hooks/useCalendarDayWeather';
import { WeatherIcon } from '@/components/weather/WeatherIcon';
import { WeatherWindowDialog } from '@/components/weather/WeatherWindowDialog';
import { getWeatherIconPalette } from '@/components/weather/weatherIconPalette';
import {
  formatWeatherTemperature,
  getWeatherConditionLabel,
  getWeatherTemperatureColor,
  resolveWeatherPrecipitationMode,
} from '@/utils/weather';
import { formatWeatherDayRangeCompact, summarizeDayTemperatureRange } from '@/utils/weatherDayGroups';
import { buildSelectedDateWeatherMetaItems } from './selectedDateWeatherMeta';
import { useSelectedDateLabels } from './useSelectedDateLabels';

interface SelectedDateWeatherCardProps {
  date: Date | null;
  hint?: string;
}

/**
 * Single mobile-first day summary under the calendar:
 * eyebrow (Today / weekday) + date left, temp + icon right, one meta line.
 * No nested weather card, no chevron, no zero precip/wind noise.
 */
export function SelectedDateWeatherCard({ date, hint }: SelectedDateWeatherCardProps) {
  const { t } = useTranslation();
  const labels = useSelectedDateLabels(date);
  const weather = useCalendarDayWeather(date);
  const [dialogOpen, setDialogOpen] = useState(false);

  const summary = weather.forecast?.summary ?? null;
  const precipMode = resolveWeatherPrecipitationMode(weather.forecast?.source);
  const condition = summary ? getWeatherConditionLabel(t, summary.conditionKey) : null;
  const temperatureColor = summary ? getWeatherTemperatureColor(summary) : null;
  const iconPalette = summary ? getWeatherIconPalette(summary.conditionKey, summary.isDay) : null;

  const dayRange = useMemo(() => {
    if (!weather.forecast?.hours?.length) return null;
    const range = summarizeDayTemperatureRange(weather.forecast.hours);
    return range ? formatWeatherDayRangeCompact(range, weather.locale) : null;
  }, [weather.forecast?.hours, weather.locale]);

  const metaItems = useMemo(
    () =>
      buildSelectedDateWeatherMetaItems({
        condition,
        dayRange,
        summary,
        precipMode,
        locale: weather.locale,
        t,
      }),
    [condition, dayRange, precipMode, summary, t, weather.locale],
  );

  const canOpen = Boolean(
    weather.canLoad && weather.forecast && !weather.pending && weather.startTime && weather.endTime,
  );

  const openDialog = useCallback(() => setDialogOpen(true), []);
  const closeDialog = useCallback(() => setDialogOpen(false), []);

  if (!date || !labels.dayMonth) return null;

  const eyebrow = labels.relative ?? labels.weekday;
  const tempLabel = summary
    ? formatWeatherTemperature(summary, { locale: weather.locale, compact: true })
    : null;

  const surfaceStyle = iconPalette
    ? {
        background: `linear-gradient(105deg, ${iconPalette.surfaceColor} 0%, transparent 55%)`,
        borderColor: iconPalette.borderColor,
      }
    : undefined;

  const body = (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <p
            className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
              labels.relative
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            {eyebrow}
          </p>
        ) : null}
        <p className="mt-0.5 truncate text-[17px] font-semibold leading-snug tracking-tight text-gray-900 dark:text-white">
          {labels.dayMonth}
        </p>
        {metaItems.length > 0 ? (
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-snug">
            {metaItems.map((item, i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                {i > 0 ? (
                  <span className="text-gray-300 dark:text-gray-600" aria-hidden>
                    ·
                  </span>
                ) : null}
                {item}
              </span>
            ))}
          </p>
        ) : weather.canLoad && !weather.pending ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('weather.unavailableShort', {
              defaultValue: 'Forecast is not available for this time yet.',
            })}
          </p>
        ) : null}
      </div>

      {weather.canLoad ? (
        <div
          className="flex shrink-0 items-center gap-1.5 pl-1"
          aria-hidden={Boolean(summary && !weather.pending)}
        >
          {weather.pending ? (
            <Loader2
              size={22}
              className="animate-spin text-sky-500/70"
              aria-label={t('weather.loading', { defaultValue: 'Loading forecast' })}
            />
          ) : summary && tempLabel ? (
            <>
              <WeatherIcon conditionKey={summary.conditionKey} isDay={summary.isDay} size={26} />
              <span
                className="text-[28px] font-semibold leading-none tabular-nums tracking-tight"
                style={temperatureColor ? { color: temperatureColor.textColor } : undefined}
              >
                {tempLabel}
              </span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const shellClass =
    'w-full rounded-2xl border bg-white/95 px-3.5 py-3 text-left shadow-sm dark:bg-gray-900/85';

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={format(date, 'yyyy-MM-dd')}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="mx-auto -mt-1 mb-2 max-w-md px-1"
      >
        {canOpen ? (
          <button
            type="button"
            onClick={openDialog}
            className={`${shellClass} transition-[box-shadow,transform] duration-150 hover:shadow-md active:scale-[0.99]`}
            style={surfaceStyle}
            aria-label={t('weather.openForecast', {
              condition: condition ?? '',
              temperature: summary
                ? formatWeatherTemperature(summary, { locale: weather.locale })
                : '',
              defaultValue: 'Open weather forecast: {{temperature}}, {{condition}}',
            })}
            data-testid="selected-date-weather-card"
          >
            {body}
          </button>
        ) : (
          <div
            className={`${shellClass} border-gray-200/80 dark:border-gray-700/80`}
            style={surfaceStyle}
            data-testid="selected-date-weather-card"
          >
            {body}
          </div>
        )}

        {hint ? (
          <p className="mt-2 px-1 text-center text-xs text-gray-500 dark:text-gray-400">{hint}</p>
        ) : null}

        {weather.canLoad && weather.cityId && weather.startTime && weather.endTime ? (
          <WeatherWindowDialog
            open={dialogOpen}
            onClose={closeDialog}
            cityId={weather.cityId}
            cityTimezone={weather.cityTimezone ?? undefined}
            startTime={weather.startTime}
            endTime={weather.endTime}
            locale={weather.locale}
            hour12={weather.hour12}
            modalId={`weather-selected-day-${weather.cityId}-${weather.dayKey}`}
            gameWindowHighlight={false}
          />
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}
