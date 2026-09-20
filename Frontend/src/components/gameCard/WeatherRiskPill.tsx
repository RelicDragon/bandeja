/**
 * PRD 357 — the rain / wind pill on the Home and Find game cards.
 *
 * It only ever renders for a game the backend has already decided is outdoor,
 * inside 48 h and over the threshold (`weatherRisk` enrichment). There is no
 * client-side guessing: no `weatherRisk` means no pill, which is also what a
 * missing forecast looks like.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudRain, Wind } from 'lucide-react';
import type { WeatherRisk } from '@/types/gameCardEnrichment';
import {
  formatClockTime,
  formatPercent,
  formatWindSpeed,
  shouldShowWeatherPill,
  weatherRiskTone,
} from '@/features/weather-alerts/weatherRiskDisplay';

const LONG_PRESS_MS = 450;
const TOOLTIP_VISIBLE_MS = 2200;

const PILL =
  'relative inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium';

const TONE_CLASSES: Record<'rain' | 'wind' | 'kept', string> = {
  rain: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  wind: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
  kept: 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400',
};

interface WeatherRiskPillProps {
  weatherRisk: WeatherRisk | null | undefined;
  locale: string;
  hour12?: boolean;
  timeZone?: string | null;
}

export function WeatherRiskPill({
  weatherRisk,
  locale,
  hour12,
  timeZone,
}: WeatherRiskPillProps) {
  const { t } = useTranslation();
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    pressTimer.current = null;
    hideTimer.current = null;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const startPress = useCallback(() => {
    clearTimers();
    pressTimer.current = setTimeout(() => {
      setTooltipOpen(true);
      hideTimer.current = setTimeout(() => setTooltipOpen(false), TOOLTIP_VISIBLE_MS);
    }, LONG_PRESS_MS);
  }, [clearTimers]);

  const cancelPress = useCallback(() => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }, []);

  if (!shouldShowWeatherPill(weatherRisk)) return null;

  const tone = weatherRiskTone(weatherRisk);
  const kept = weatherRisk.keptAsPlanned === true;
  const time = formatClockTime(weatherRisk.at, locale, { timeZone, hour12 });
  const value =
    tone === 'wind'
      ? formatWindSpeed(weatherRisk.windKph, locale)
      : formatPercent(weatherRisk.pop, locale);

  const ariaLabel = kept
    ? t('weatherAlerts.pillAriaKept')
    : tone === 'wind'
      ? t('weatherAlerts.pillAriaWind', { wind: value, time })
      : t('weatherAlerts.pillAriaRain', { pop: value, time });

  const Icon = tone === 'wind' ? Wind : CloudRain;

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={`${PILL} ${TONE_CLASSES[kept ? 'kept' : tone]}`}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={() => {
        cancelPress();
        setTooltipOpen(false);
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Icon size={12} aria-hidden="true" />
      <span aria-hidden="true">{value}</span>
      {tooltipOpen && (
        <span
          role="tooltip"
          aria-hidden="true"
          className="pointer-events-none absolute -top-8 start-0 z-20 whitespace-nowrap rounded-md bg-gray-900/90 px-2 py-1 text-[11px] font-normal text-white shadow-lg dark:bg-gray-100/95 dark:text-gray-900"
        >
          {t('weatherAlerts.pillTooltip', { time })}
        </span>
      )}
    </span>
  );
}
