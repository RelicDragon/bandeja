import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Droplets, Wind } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { WeatherHourlyPoint } from '@/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useWeatherDayQuery, weatherDayQueryOptions } from '@/queries/weather';
import {
  formatWeatherTemperature,
  formatWeatherTime,
  getForecastUpdatedLabel,
  formatWeatherTimezoneLabel,
  getWeatherTemperatureColor,
  getWeatherConditionLabel,
} from '@/utils/weather';
import {
  compareDayKeys,
  dateKeyInTimezone,
  formatWeatherDayLabel,
  maxForecastDayKey,
  shiftDayKey,
} from '@/utils/weatherDayGroups';
import { WeatherDayChart } from './WeatherDayChart';
import { WeatherIcon } from './WeatherIcon';
import { getWeatherIconPalette } from './weatherIconPalette';
import { useHorizontalSwipe } from './useHorizontalSwipe';

interface WeatherWindowDialogProps {
  open: boolean;
  onClose: () => void;
  cityId: string;
  cityTimezone?: string;
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

function scrollRowIntoView(
  scrollContainer: HTMLDivElement,
  targetElement: HTMLDivElement,
  behavior: ScrollBehavior,
  alignment: 'start' | 'center',
) {
  const containerRect = scrollContainer.getBoundingClientRect();
  const targetRect = targetElement.getBoundingClientRect();
  const targetTop = targetRect.top - containerRect.top + scrollContainer.scrollTop;
  const centeredOffset = (scrollContainer.clientHeight - targetElement.clientHeight) / 2;

  scrollContainer.scrollTo({
    top: Math.max(0, alignment === 'center' ? targetTop - centeredOffset : targetTop),
    behavior,
  });
}

const DAY_SLIDE_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

function WeatherDayRowsSkeleton() {
  return (
    <div className="space-y-2 py-1">
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-1 py-2.5"
        >
          <div className="h-9 w-9 animate-pulse rounded-lg bg-gray-200/80 dark:bg-gray-800" />
          <div className="space-y-2">
            <div className="h-4 w-16 animate-pulse rounded bg-gray-200/80 dark:bg-gray-800" />
            <div className="h-3 w-28 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
          </div>
          <div className="h-6 w-10 animate-pulse rounded bg-gray-200/80 dark:bg-gray-800" />
        </div>
      ))}
    </div>
  );
}

function WeatherWindowDialogInner({
  open,
  onClose,
  cityId,
  cityTimezone: cityTimezoneProp,
  startTime,
  endTime,
  locale,
  hour12,
  modalId,
}: WeatherWindowDialogProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const queryClient = useQueryClient();
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [slideDirection, setSlideDirection] = useState(0);
  const hourlyScrollRef = useRef<HTMLDivElement | null>(null);
  const daySwipeRef = useRef<HTMLDivElement | null>(null);
  const initialScrollKeyRef = useRef<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const headerRef = useRef<{
    cityName: string;
    timezoneLabel: string;
    updatedLabel: string;
    stale: boolean;
  } | null>(null);

  const initialTimezone = cityTimezoneProp ?? 'UTC';
  const gameDayKey = useMemo(
    () => dateKeyInTimezone(new Date(startTime), initialTimezone),
    [initialTimezone, startTime],
  );

  useEffect(() => {
    if (!open) {
      initialScrollKeyRef.current = null;
      return;
    }
    setSelectedDayKey(gameDayKey);
    setSelectedTime(null);
    setSlideDirection(0);
  }, [gameDayKey, open]);

  const activeDayKey = selectedDayKey ?? gameDayKey;
  const dayQuery = useWeatherDayQuery(cityId, activeDayKey, open && Boolean(cityId && activeDayKey));
  const timezone = dayQuery.data?.cityTimezone ?? cityTimezoneProp ?? 'UTC';
  const resolvedGameDayKey = useMemo(
    () => dateKeyInTimezone(new Date(startTime), timezone),
    [startTime, timezone],
  );
  const maxDayKey = useMemo(() => maxForecastDayKey(timezone), [timezone]);
  const activeDayData = dayQuery.data?.date === activeDayKey ? dayQuery.data : undefined;
  const sortedRows = useMemo(
    () => activeDayData?.hours ?? [],
    [activeDayData?.hours],
  );
  const hasRows = Boolean(activeDayData?.available && sortedRows.length > 0);
  const isDayLoading = dayQuery.isFetching && !hasRows;
  const isGameDay = activeDayKey === resolvedGameDayKey;
  const canGoPrevious = true;
  const canGoNext = compareDayKeys(activeDayKey, maxDayKey) < 0;

  useEffect(() => {
    if (!open || !cityId || !activeDayKey) return;

    const previousDay = shiftDayKey(activeDayKey, -1);
    const nextDay = shiftDayKey(activeDayKey, 1);

    void queryClient.prefetchQuery(weatherDayQueryOptions(cityId, previousDay, true));
    if (compareDayKeys(nextDay, maxDayKey) <= 0) {
      void queryClient.prefetchQuery(weatherDayQueryOptions(cityId, nextDay, true));
    }
  }, [activeDayKey, cityId, maxDayKey, open, queryClient]);

  useEffect(() => {
    if (!selectedTime) return;
    if (!sortedRows.some((point) => point.time === selectedTime)) {
      setSelectedTime(null);
    }
  }, [selectedTime, sortedRows]);

  useEffect(() => {
    if (!open) {
      initialScrollKeyRef.current = null;
      return;
    }
    if (!hasRows || !isGameDay || typeof window === 'undefined') return;

    const firstGameHourIndex = sortedRows.findIndex((point) => resolveRowPhase(point, startTime, endTime) === 'game');
    if (firstGameHourIndex < 0) return;

    const targetRow = sortedRows[Math.max(0, firstGameHourIndex - 1)];
    const scrollKey = `${modalId}:${startTime}:${endTime}:${targetRow.time}:${activeDayKey}`;
    if (initialScrollKeyRef.current === scrollKey) return;
    initialScrollKeyRef.current = scrollKey;

    window.requestAnimationFrame(() => {
      const scrollContainer = hourlyScrollRef.current;
      const targetElement = rowRefs.current.get(targetRow.time);
      if (!scrollContainer || !targetElement) return;

      scrollRowIntoView(scrollContainer, targetElement, reduceMotion ? 'auto' : 'smooth', 'start');
    });
  }, [activeDayKey, endTime, hasRows, isGameDay, modalId, open, reduceMotion, sortedRows, startTime]);

  const metadata = useMemo(() => {
    if (dayQuery.data?.date === activeDayKey) {
      const nextMetadata = {
        cityName: dayQuery.data.cityName,
        timezoneLabel: formatWeatherTimezoneLabel(dayQuery.data.cityTimezone, locale),
        updatedLabel: dayQuery.data.source === 'archive'
          ? t('weather.recordedConditions', { defaultValue: 'Recorded conditions' })
          : getForecastUpdatedLabel(t, dayQuery.data.fetchedAt),
        stale: dayQuery.data.stale,
      };
      headerRef.current = nextMetadata;
      return nextMetadata;
    }

    if (headerRef.current) return headerRef.current;

    if (cityTimezoneProp) {
      return {
        cityName: '',
        timezoneLabel: formatWeatherTimezoneLabel(cityTimezoneProp, locale),
        updatedLabel: t('weather.loading', { defaultValue: 'Loading forecast' }),
        stale: false,
      };
    }

    return null;
  }, [activeDayKey, cityTimezoneProp, dayQuery.data, locale, t]);

  const handleChartPointSelect = useCallback((time: string) => {
    setSelectedTime(time);

    const scrollToSelectedRow = () => {
      const scrollContainer = hourlyScrollRef.current;
      const targetElement = rowRefs.current.get(time);
      if (!scrollContainer || !targetElement) return;

      scrollRowIntoView(scrollContainer, targetElement, reduceMotion ? 'auto' : 'smooth', 'center');
    };

    if (typeof window === 'undefined') {
      scrollToSelectedRow();
      return;
    }

    window.requestAnimationFrame(scrollToSelectedRow);
  }, [reduceMotion]);

  const navigateDay = useCallback((direction: 'left' | 'right') => {
    if (direction === 'left') {
      setSlideDirection(-1);
      setSelectedDayKey(shiftDayKey(activeDayKey, -1));
    } else if (canGoNext) {
      setSlideDirection(1);
      setSelectedDayKey(shiftDayKey(activeDayKey, 1));
    } else {
      return;
    }
    setSelectedTime(null);
    if (hourlyScrollRef.current) {
      hourlyScrollRef.current.scrollTop = 0;
    }
  }, [activeDayKey, canGoNext]);

  // Swipe left/right on the day content to move between days, mirroring the chart's prev/next buttons.
  useHorizontalSwipe(daySwipeRef, {
    enabled: open,
    onSwipeLeft: () => navigateDay('right'),
    onSwipeRight: () => navigateDay('left'),
  });

  const handleGoToGameDay = useCallback(() => {
    setSlideDirection(compareDayKeys(activeDayKey, resolvedGameDayKey) > 0 ? -1 : 1);
    setSelectedDayKey(resolvedGameDayKey);
    setSelectedTime(null);
    if (hourlyScrollRef.current) {
      hourlyScrollRef.current.scrollTop = 0;
    }
  }, [activeDayKey, resolvedGameDayKey]);

  const chartDayLabel = formatWeatherDayLabel(activeDayKey, timezone, locale, t);

  return (
    <Dialog open={open} onClose={onClose} modalId={modalId}>
      <DialogContent className="max-w-[92vw] rounded-2xl sm:max-w-lg" data-testid="weather-dialog">
        <DialogTitle className="sr-only">
          {t('weather.forecastTitle', { defaultValue: 'Game weather' })}
        </DialogTitle>

        {(metadata || open) ? (
          <div className="border-b border-gray-100 px-4 py-3 pr-12 text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <span className="block truncate">
              {metadata?.cityName ? (
                <>
                  {metadata.cityName}
                  <span className="mx-1 text-gray-300 dark:text-gray-600">·</span>
                </>
              ) : null}
              <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">
                {metadata?.timezoneLabel ?? formatWeatherTimezoneLabel(cityTimezoneProp ?? 'UTC', locale)}
              </span>
              {metadata?.updatedLabel ? (
                <>
                  <span className="mx-1 text-gray-300 dark:text-gray-600">·</span>
                  <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">{metadata.updatedLabel}</span>
                </>
              ) : null}
              {metadata?.stale ? (
                <>
                  <span className="mx-1 text-gray-300 dark:text-gray-600">·</span>
                  <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">
                    {t('weather.stale', { defaultValue: 'stale' })}
                  </span>
                </>
              ) : null}
            </span>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col p-3">
          <div ref={daySwipeRef} className="relative min-h-[26rem] flex-1 overflow-hidden">
            <AnimatePresence initial={false}>
              <motion.div
                key={activeDayKey}
                initial={reduceMotion ? false : { opacity: 0, x: slideDirection * 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: slideDirection * -28 }}
                transition={DAY_SLIDE_TRANSITION}
                className="absolute inset-0 flex min-h-0 flex-col"
              >
                <div className="shrink-0">
                  <WeatherDayChart
                    points={sortedRows}
                    locale={locale}
                    hour12={hour12}
                    cityTimezone={timezone}
                    startTime={startTime}
                    endTime={endTime}
                    selectedTime={selectedTime}
                    onPointSelect={handleChartPointSelect}
                    showGameWindow={isGameDay}
                    dayLabel={chartDayLabel}
                    canGoPrevious={canGoPrevious}
                    canGoNext={canGoNext}
                    onPrevious={() => navigateDay('left')}
                    onNext={() => navigateDay('right')}
                    showGoToGameDay={!isGameDay}
                    onGoToGameDay={handleGoToGameDay}
                    isLoading={isDayLoading}
                  />
                </div>

                <div ref={hourlyScrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
                  {isDayLoading ? (
                    <WeatherDayRowsSkeleton />
                  ) : !hasRows ? (
                    <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-950/50 dark:text-gray-300">
                      {activeDayData?.unavailableReason === 'missing_city_coordinates'
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
                        const temperatureColor = getWeatherTemperatureColor(point);
                        const iconPalette = getWeatherIconPalette(point.conditionKey, point.isDay);
                        const phase = isGameDay ? resolveRowPhase(point, startTime, endTime) : 'after';
                        const isGameHour = phase === 'game';
                        const isSelected = selectedTime === point.time;
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
                                  {formatWeatherTime(point.time, locale, hour12, timezone)}
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
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const WeatherWindowDialog = memo(WeatherWindowDialogInner);
