import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Droplets, Loader2, Wind } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { WeatherHourlyPoint, WeatherWindow } from '@/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { LAYOUT_TRANSITION, PANEL_TRANSITION } from '@/components/motion/motionTokens';
import {
  formatWeatherTemperature,
  formatWeatherTime,
  getForecastUpdatedLabel,
  getWeatherTemperatureColor,
  getWeatherConditionLabel,
} from '@/utils/weather';
import { WeatherDayChart } from './WeatherDayChart';
import { WeatherIcon } from './WeatherIcon';
import { getWeatherIconPalette } from './weatherIconPalette';

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

type WeatherRowPhase = 'before' | 'game' | 'after';

const GAME_PHASE_CONFIG = {
  labelKey: 'weather.gameTime',
  defaultLabel: 'Game',
};

function resolveRowPhase(
  point: WeatherHourlyPoint,
  startTime: string,
  endTime: string,
): WeatherRowPhase {
  const time = new Date(point.time).getTime();
  const nextHour = time + 60 * 60 * 1000;
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (nextHour <= start) return 'before';
  if (time >= end) return 'after';
  return 'game';
}

function WeatherWindowDialogInner({
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
  const reduceMotion = usePrefersReducedMotion();
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const previousIsFullDayRef = useRef(false);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hasRows = Boolean(forecast?.available && forecast.hours.length > 0);
  const sortedRows = useMemo(
    () => [...(forecast?.hours ?? [])].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()),
    [forecast?.hours],
  );
  useEffect(() => {
    if (!selectedTime) return;
    if (!sortedRows.some((point) => point.time === selectedTime)) {
      setSelectedTime(null);
    }
  }, [selectedTime, sortedRows]);
  useEffect(() => {
    const becameFullDay = isFullDay && !previousIsFullDayRef.current;
    previousIsFullDayRef.current = isFullDay;

    if (!becameFullDay || typeof window === 'undefined') return;

    window.requestAnimationFrame(() => {
      bodyScrollRef.current?.scrollTo({
        top: 0,
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
    });
  }, [isFullDay, reduceMotion]);

  const metadata = useMemo(
    () =>
      forecast
        ? [
            forecast.cityName,
            getForecastUpdatedLabel(t, forecast.fetchedAt),
            forecast.stale ? t('weather.stale', { defaultValue: 'stale' }) : null,
          ].filter(Boolean)
        : [],
    [forecast, t],
  );
  const showFullDayButton = Boolean(hasRows && onShowFullDay && !isFullDay);
  const handleChartPointSelect = useCallback((time: string) => {
    setSelectedTime(time);

    const scrollToSelectedRow = () => {
      rowRefs.current.get(time)?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    };

    if (typeof window === 'undefined') {
      scrollToSelectedRow();
      return;
    }

    window.requestAnimationFrame(scrollToSelectedRow);
  }, [reduceMotion]);

  return (
    <Dialog open={open} onClose={onClose} modalId={modalId}>
      <DialogContent
        className={`max-w-[92vw] rounded-2xl transition-[max-width] duration-300 ease-out ${
          isFullDay ? 'sm:max-w-lg' : 'sm:max-w-md'
        }`}
      >
        <DialogTitle className="sr-only">
          {t('weather.forecastTitle', { defaultValue: 'Game weather' })}
        </DialogTitle>

        {metadata.length > 0 ? (
          <div className="border-b border-gray-100 px-4 py-3 pr-12 text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <span className="block truncate">{metadata.join(' · ')}</span>
          </div>
        ) : null}

        <div
          ref={bodyScrollRef}
          className={`overflow-y-auto p-3 transition-[max-height] duration-300 ease-out ${
            isFullDay ? 'max-h-[78vh]' : 'max-h-[65vh]'
          }`}
        >
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
            <div>
              <AnimatePresence initial={false}>
                {isFullDay ? (
                  <motion.div
                    key="weather-full-day-chart"
                    layout={!reduceMotion}
                    initial={reduceMotion ? false : { opacity: 0, height: 0, y: -8 }}
                    animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto', y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -8 }}
                    transition={{
                      opacity: PANEL_TRANSITION,
                      height: LAYOUT_TRANSITION,
                      y: PANEL_TRANSITION,
                      layout: LAYOUT_TRANSITION,
                    }}
                    className="overflow-hidden"
                  >
                    <WeatherDayChart
                      points={sortedRows}
                      locale={locale}
                      hour12={hour12}
                      startTime={startTime}
                      endTime={endTime}
                      selectedTime={selectedTime}
                      onPointSelect={handleChartPointSelect}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {sortedRows.map((point) => {
                  const condition = getWeatherConditionLabel(t, point.conditionKey);
                  const temperatureColor = getWeatherTemperatureColor(point);
                  const iconPalette = getWeatherIconPalette(point.conditionKey, point.isDay);
                  const phase = resolveRowPhase(point, startTime, endTime);
                  const isGameHour = phase === 'game';
                  const isSelected = isFullDay && selectedTime === point.time;
                  return (
                    <div
                      key={point.time}
                      ref={(element) => {
                        if (element) {
                          rowRefs.current.set(point.time, element);
                        } else {
                          rowRefs.current.delete(point.time);
                        }
                      }}
                      aria-current={isSelected ? 'true' : undefined}
                      className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 overflow-hidden rounded-lg px-1 py-2.5 transition-colors first:pt-0 last:pb-0 ${
                        isSelected
                          ? 'bg-sky-50/90 ring-2 ring-inset ring-sky-400/70 dark:bg-sky-950/40 dark:ring-sky-500/60'
                          : ''
                      }`}
                    >
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-lg border"
                        style={{
                          backgroundColor: iconPalette.surfaceColor,
                          borderColor: iconPalette.borderColor,
                        }}
                      >
                        <WeatherIcon conditionKey={point.conditionKey} isDay={point.isDay} size={19} />
                      </div>
                      <div className="min-w-0">
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {formatWeatherTime(point.time, locale, hour12)}
                          </span>
                        </div>
                        {point.precipitationProbability != null || point.windSpeedKmh != null ? (
                          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {point.precipitationProbability != null ? (
                              <span
                                className={`inline-flex items-center gap-1 ${
                                  point.precipitationProbability > 0
                                    ? 'font-medium text-sky-600 dark:text-sky-300'
                                    : ''
                                }`}
                              >
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
                        ) : null}
                        <div className="mt-0.5 min-w-0 text-xs text-gray-500 dark:text-gray-400">
                          <span className="truncate">{condition}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        {isGameHour ? (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-white"
                            style={{ backgroundColor: temperatureColor.textColor }}
                          >
                            {t(GAME_PHASE_CONFIG.labelKey, { defaultValue: GAME_PHASE_CONFIG.defaultLabel })}
                          </span>
                        ) : null}
                        <div
                          className="text-lg font-semibold leading-none tabular-nums"
                          style={{ color: temperatureColor.textColor }}
                        >
                          {formatWeatherTemperature(point, { locale })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <AnimatePresence initial={false}>
                  {showFullDayButton ? (
                    <motion.div
                      key="weather-full-day-button"
                      layout={!reduceMotion}
                      initial={reduceMotion ? false : { opacity: 0, height: 0, y: 6 }}
                      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto', y: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -4 }}
                      transition={{
                        opacity: PANEL_TRANSITION,
                        height: LAYOUT_TRANSITION,
                        y: PANEL_TRANSITION,
                        layout: LAYOUT_TRANSITION,
                      }}
                      className="overflow-hidden pt-3"
                    >
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
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const WeatherWindowDialog = memo(WeatherWindowDialogInner);
