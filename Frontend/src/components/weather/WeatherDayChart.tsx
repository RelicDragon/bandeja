import { type MouseEvent, useId, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Droplets, Thermometer } from 'lucide-react';
import type { WeatherHourlyPoint } from '@/types';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  formatWeatherPrecipitationAmount,
  formatWeatherTemperature,
  formatWeatherTime,
  getWeatherTemperatureColor,
  getWeatherPrecipitationValue,
  shouldUseFahrenheit,
  type WeatherPrecipitationMode,
} from '@/utils/weather';
import { getWeatherDayChartRainBarGeometry } from './weatherDayChartGeometry';

interface WeatherDayChartProps {
  points: WeatherHourlyPoint[];
  locale: string;
  hour12: boolean;
  cityTimezone: string;
  startTime: string;
  endTime: string;
  selectedTime?: string | null;
  onPointSelect?: (time: string) => void;
  showGameWindow?: boolean;
  dayLabel?: string;
  canGoPrevious?: boolean;
  canGoNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  showGoToGameDay?: boolean;
  onGoToGameDay?: () => void;
  isLoading?: boolean;
  precipitationMode?: WeatherPrecipitationMode;
}

interface ChartPoint {
  time: string;
  label: string;
  displayTemperature: number;
  temperatureC: number;
  precipitationProbability: number;
  precipitationTooltip: string;
  hasPrecipitation: boolean;
  x: number;
  y: number;
  barHeight: number;
  isGameHour: boolean;
  temperatureColor: ReturnType<typeof getWeatherTemperatureColor>;
}

const CHART_WIDTH = 100;
const CHART_HEIGHT = 100;
const TOP_PADDING = 12;
const BOTTOM_PADDING = 24;
const BAR_MAX_HEIGHT = 30;

const chartNavButtonClass =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200/80 bg-white text-gray-600 shadow-sm transition-[box-shadow,background-color,color,opacity] hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-700/80 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white';

function formatTemperatureRange(min: number, max: number, unit: 'C' | 'F', locale: string): string {
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  return `${formatter.format(min)}-${formatter.format(max)}°${unit}`;
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function isPointDuringGame(pointTime: string, startTime: string, endTime: string): boolean {
  const time = new Date(pointTime).getTime();
  const nextHour = time + 60 * 60 * 1000;
  return nextHour > new Date(startTime).getTime() && time < new Date(endTime).getTime();
}

export function WeatherDayChart({
  points,
  locale,
  hour12,
  cityTimezone,
  startTime,
  endTime,
  selectedTime,
  onPointSelect,
  showGameWindow = true,
  dayLabel,
  canGoPrevious = false,
  canGoNext = false,
  onPrevious,
  onNext,
  showGoToGameDay = false,
  onGoToGameDay,
  isLoading = false,
  precipitationMode = 'probability',
}: WeatherDayChartProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const chartButtonRef = useRef<HTMLButtonElement | null>(null);
  const rainGradientId = useId().replace(/:/g, '');
  const unit = shouldUseFahrenheit(locale) ? 'F' : 'C';
  const showDayNav = Boolean(onPrevious || onNext);
  const chartTitle = dayLabel ?? t('weather.dayChartTitle', { defaultValue: 'Full-day outlook' });

  const chart = useMemo(() => {
    const usablePoints = points
      .map((point) => ({
        point,
        displayTemperature: unit === 'F' ? point.temperatureF : point.temperatureC,
        precipValue: getWeatherPrecipitationValue(point, precipitationMode) ?? 0,
      }))
      .filter(({ displayTemperature }) => isFiniteNumber(displayTemperature));

    if (usablePoints.length < 2) return null;

    const displayTemperatures = usablePoints.map(({ displayTemperature }) => displayTemperature);
    const celsiusTemperatures = usablePoints.map(({ point }) => point.temperatureC);
    const minDisplayTemperature = Math.min(...displayTemperatures);
    const maxDisplayTemperature = Math.max(...displayTemperatures);
    const minTemperatureC = Math.min(...celsiusTemperatures);
    const maxTemperatureC = Math.max(...celsiusTemperatures);
    const temperatureSpan = Math.max(1, maxDisplayTemperature - minDisplayTemperature);
    const plotHeight = CHART_HEIGHT - TOP_PADDING - BOTTOM_PADDING;
    const lastIndex = Math.max(1, usablePoints.length - 1);
    const precipScaleMax = precipitationMode === 'amount'
      ? Math.max(0.1, ...usablePoints.map(({ precipValue }) => precipValue))
      : 100;
    const chartPoints: ChartPoint[] = usablePoints.map(({ point, displayTemperature, precipValue }, index) => {
      const x = (index / lastIndex) * CHART_WIDTH;
      const y = TOP_PADDING + ((maxDisplayTemperature - displayTemperature) / temperatureSpan) * plotHeight;
      const precipIntensity = precipitationMode === 'amount'
        ? Math.min(100, Math.max(0, (precipValue / precipScaleMax) * 100))
        : Math.min(100, Math.max(0, precipValue));
      const hasPrecipitation = precipValue > 0;
      const precipitationTooltip = precipitationMode === 'amount'
        ? t('weather.precipitationAmount', {
            amount: formatWeatherPrecipitationAmount(precipValue, locale),
            defaultValue: '{{amount}} mm',
          })
        : `${Math.round(precipValue)}%`;

      return {
        time: point.time,
        label: formatWeatherTime(point.time, locale, hour12, cityTimezone),
        displayTemperature,
        temperatureC: point.temperatureC,
        precipitationProbability: precipIntensity,
        precipitationTooltip,
        hasPrecipitation,
        x,
        y,
        barHeight: hasPrecipitation ? Math.max(3.5, (precipIntensity / 100) * BAR_MAX_HEIGHT) : 0,
        isGameHour: showGameWindow && isPointDuringGame(point.time, startTime, endTime),
        temperatureColor: getWeatherTemperatureColor(point),
      };
    });

    return {
      points: chartPoints,
      minDisplayTemperature,
      maxDisplayTemperature,
      minTemperatureC,
      maxTemperatureC,
      peakPrecipValue: Math.max(...usablePoints.map(({ precipValue }) => precipValue)),
    };
  }, [cityTimezone, endTime, hour12, locale, points, precipitationMode, showGameWindow, startTime, t, unit]);

  if (isLoading || !chart) {
    if (!isLoading) return null;

    return (
      <div className="mb-3 rounded-xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/70 to-emerald-50/80 p-3 shadow-sm dark:border-sky-900/60 dark:from-gray-950 dark:via-sky-950/30 dark:to-emerald-950/20">
        <div className="mb-2 flex items-center gap-2">
          {showDayNav ? (
            <motion.button
              type="button"
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              onClick={onPrevious}
              disabled={!canGoPrevious}
              className={chartNavButtonClass}
              aria-label={t('weather.previousDay', { defaultValue: 'Previous day' })}
            >
              <ChevronLeft size={17} strokeWidth={2.25} />
            </motion.button>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">{chartTitle}</div>
            <div className="mt-1 h-3 w-32 animate-pulse rounded bg-gray-200/80 dark:bg-gray-800" />
          </div>

          {showDayNav ? (
            <motion.button
              type="button"
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              onClick={onNext}
              disabled={!canGoNext}
              className={chartNavButtonClass}
              aria-label={t('weather.nextDay', { defaultValue: 'Next day' })}
            >
              <ChevronRight size={17} strokeWidth={2.25} />
            </motion.button>
          ) : null}
        </div>

        <div
          className="relative h-32 w-full overflow-hidden rounded-lg bg-sky-50/80 dark:bg-sky-950/20"
          aria-hidden
        >
          <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/5" />
        </div>

        {showGoToGameDay && onGoToGameDay ? (
          <div className="mt-1">
            <button
              type="button"
              onClick={onGoToGameDay}
              className="inline-flex shrink-0 items-center gap-0.5 text-[9px] font-medium text-sky-700 transition-colors hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100"
            >
              {t('weather.goToGameDay', { defaultValue: 'Go to game day' })}
              <ChevronRight size={11} strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const labelIndexes = Array.from(
    new Set([0, Math.floor((chart.points.length - 1) / 2), chart.points.length - 1]),
  );
  const peakPrecipitation = chart.peakPrecipValue;
  const averageTemperatureColor = getWeatherTemperatureColor({
    temperatureC: (chart.minTemperatureC + chart.maxTemperatureC) / 2,
  });
  const handleChartClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!onPointSelect) return;

    const bounds = chartButtonRef.current?.getBoundingClientRect();
    const targetX = event.detail === 0 || !bounds || bounds.width <= 0
      ? (chart.points.find((point) => point.time === selectedTime)?.x ?? chart.points[0].x)
      : ((event.clientX - bounds.left) / bounds.width) * CHART_WIDTH;
    const selectedPoint = chart.points.reduce((closest, point) => (
      Math.abs(point.x - targetX) < Math.abs(closest.x - targetX) ? point : closest
    ));

    onPointSelect(selectedPoint.time);
  };

  return (
    <div className="mb-3 rounded-xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/70 to-emerald-50/80 p-3 shadow-sm dark:border-sky-900/60 dark:from-gray-950 dark:via-sky-950/30 dark:to-emerald-950/20">
      <div className="mb-2 flex items-center gap-2">
        {showDayNav ? (
          <motion.button
            type="button"
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            onClick={onPrevious}
            disabled={!canGoPrevious}
            className={chartNavButtonClass}
            aria-label={t('weather.previousDay', { defaultValue: 'Previous day' })}
          >
            <ChevronLeft size={17} strokeWidth={2.25} />
          </motion.button>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">{chartTitle}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1">
              <Thermometer size={12} style={{ color: averageTemperatureColor.iconColor }} />
              <span style={{ color: averageTemperatureColor.textColor }}>
                {formatTemperatureRange(chart.minDisplayTemperature, chart.maxDisplayTemperature, unit, locale)}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Droplets size={12} className="text-sky-500" />
              {precipitationMode === 'amount'
                ? t('weather.precipitationPeakMm', {
                    amount: formatWeatherPrecipitationAmount(peakPrecipitation, locale),
                    defaultValue: 'Peak {{amount}} mm',
                  })
                : t('weather.precipitationPeak', {
                    probability: Math.round(peakPrecipitation),
                    defaultValue: 'Peak {{probability}}%',
                  })}
            </span>
          </div>
        </div>

        {showDayNav ? (
          <motion.button
            type="button"
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            onClick={onNext}
            disabled={!canGoNext}
            className={chartNavButtonClass}
            aria-label={t('weather.nextDay', { defaultValue: 'Next day' })}
          >
            <ChevronRight size={17} strokeWidth={2.25} />
          </motion.button>
        ) : null}
      </div>

      <button
        ref={chartButtonRef}
        type="button"
        onClick={handleChartClick}
        className="relative block h-32 w-full cursor-pointer touch-manipulation text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-sky-500/70 dark:focus-visible:ring-offset-gray-950"
        aria-label={t('weather.selectHourFromChart', {
          defaultValue: 'Select an hour from the weather chart',
        })}
      >
          <svg
            className="h-full w-full overflow-visible"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={t('weather.dayChartA11y', {
              defaultValue: 'Hourly temperature and precipitation chart',
            })}
          >
            <defs>
              <linearGradient id={rainGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(56, 189, 248)" stopOpacity="0.92" />
                <stop offset="100%" stopColor="rgb(125, 211, 252)" stopOpacity="0.58" />
              </linearGradient>
            </defs>
            <line x1="0" y1="76" x2="100" y2="76" stroke="currentColor" className="text-gray-200 dark:text-gray-800" strokeWidth="0.6" />
            <line x1="0" y1="44" x2="100" y2="44" stroke="currentColor" className="text-gray-100 dark:text-gray-900" strokeWidth="0.4" />
            {chart.points.map((point) => {
              if (!point.hasPrecipitation) return null;

              const barGeometry = getWeatherDayChartRainBarGeometry(point.x, chart.points.length);
              return (
                <rect
                  key={`${point.time}-rain`}
                  x={barGeometry.x}
                  y={76 - point.barHeight}
                  width={barGeometry.width}
                  height={point.barHeight}
                  rx="0.8"
                  fill={`url(#${rainGradientId})`}
                  opacity={0.42 + (point.precipitationProbability / 100) * 0.5}
                >
                  <title>
                    {`${point.label}: ${formatWeatherTemperature(
                      { temperatureC: point.temperatureC, temperatureF: point.displayTemperature },
                      { locale, unit },
                    )}, ${point.precipitationTooltip}`}
                  </title>
                </rect>
              );
            })}
            {chart.points.slice(1).map((point, index) => {
              const previousPoint = chart.points[index];
              const segmentColor = getWeatherTemperatureColor({
                temperatureC: (previousPoint.temperatureC + point.temperatureC) / 2,
              });
              return (
                <line
                  key={`${previousPoint.time}-${point.time}-temp-line`}
                  x1={previousPoint.x}
                  y1={previousPoint.y}
                  x2={point.x}
                  y2={point.y}
                  stroke={segmentColor.strokeColor}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>

          {chart.points.map((point) => {
            const isSelected = point.time === selectedTime;
            const markerFill = point.isGameHour ? 'rgb(16, 185, 129)' : point.temperatureColor.markerFill;
            const markerBorder = point.isGameHour ? 'rgb(4, 120, 87)' : point.temperatureColor.markerBorder;
            return (
              <span
                key={`${point.time}-temp`}
                className={`pointer-events-none absolute rounded-full border-2 shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition-all ${
                  isSelected
                    ? 'h-3.5 w-3.5 ring-4 ring-sky-300/60 dark:ring-sky-500/50'
                    : point.isGameHour
                      ? 'h-3 w-3 ring-2 ring-emerald-200/80 dark:ring-emerald-500/40'
                      : 'h-2.5 w-2.5 ring-2 ring-white/90 dark:ring-gray-950/90'
                }`}
                style={{
                  backgroundColor: markerFill,
                  borderColor: markerBorder,
                  left: `${point.x}%`,
                  top: `${point.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                title={`${point.label}: ${formatWeatherTemperature(
                  { temperatureC: point.temperatureC, temperatureF: point.displayTemperature },
                  { locale, unit },
                )}`}
              />
            );
          })}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between text-[10px] font-medium text-gray-500 dark:text-gray-400">
            {labelIndexes.map((index) => (
              <span key={chart.points[index].time}>{chart.points[index].label}</span>
            ))}
          </div>
        </button>

      <div className="mt-1 flex items-center gap-3">
        {showGoToGameDay && onGoToGameDay ? (
          <button
            type="button"
            onClick={onGoToGameDay}
            className="inline-flex shrink-0 items-center gap-0.5 text-[9px] font-medium text-sky-700 transition-colors hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100"
          >
            {t('weather.goToGameDay', { defaultValue: 'Go to game day' })}
            <ChevronRight size={11} strokeWidth={2.25} aria-hidden />
          </button>
        ) : null}
        <div className="ml-auto flex items-center justify-end gap-3 text-[9px] font-medium uppercase tracking-tight text-gray-400 dark:text-gray-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-1 w-3.5 rounded-full bg-gradient-to-r from-blue-500 via-emerald-500 to-rose-500" />
          {t('weather.temperatureShort', { defaultValue: 'Temp' })}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-sm bg-sky-300" />
          {t('weather.precipitationShort', { defaultValue: 'Rain' })}
        </span>
        </div>
      </div>
    </div>
  );
}
