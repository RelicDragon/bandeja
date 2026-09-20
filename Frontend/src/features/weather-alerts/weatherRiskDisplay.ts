/**
 * PRD 357 — pure presentation helpers for the weather risk banner and pill.
 *
 * No React, no i18next instance, no `Date.now()` hidden inside: every function
 * takes what it needs so the whole display layer is unit-testable.
 *
 * **The thresholds below mirror `Backend/src/services/weather/weatherRisk.ts`.**
 * They exist here only to answer "is this rain or wind?" for a `WeatherRisk`
 * card payload, whose shape is fixed by `types/gameCardEnrichment.ts` and does
 * not carry that flag. If the backend thresholds move, move these too.
 */
import type { WeatherRisk, WeatherRiskSeverity } from '@/types/gameCardEnrichment';
import { resolveIntlLocale } from '@/utils/intlLocale';
import { formatIntlPercent } from '@/utils/intlPercent';

/** Mirror of `WEATHER_RISK_POP_THRESHOLD`. */
export const WEATHER_RISK_POP_THRESHOLD = 60;
/** Mirror of `WEATHER_RISK_WIND_KPH_THRESHOLD`. */
export const WEATHER_RISK_WIND_KPH_THRESHOLD = 40;

/** Amber for rain, slate for wind. Both have dark-mode variants at the call site. */
export type WeatherRiskTone = 'rain' | 'wind';

export function weatherRiskTone(risk: {
  pop: number;
  windKph: number;
  windDriven?: boolean;
}): WeatherRiskTone {
  if (typeof risk.windDriven === 'boolean') return risk.windDriven ? 'wind' : 'rain';
  const rainCrosses = risk.pop >= WEATHER_RISK_POP_THRESHOLD;
  const windCrosses = risk.windKph >= WEATHER_RISK_WIND_KPH_THRESHOLD;
  return windCrosses && !rainCrosses ? 'wind' : 'rain';
}

/** i18n key for the headline word ("Rain likely", "Storm", "Strong wind", …). */
export function weatherRiskLabelKey(
  severity: WeatherRiskSeverity,
  tone: WeatherRiskTone,
): string {
  if (tone === 'wind') return 'weatherAlerts.strongWind';
  if (severity === 'storm') return 'weatherAlerts.storm';
  if (severity === 'heavy') return 'weatherAlerts.heavyRain';
  return 'weatherAlerts.rainLikely';
}

/** The card pill only exists for a real, alertable risk. */
export function shouldShowWeatherPill(risk: WeatherRisk | null | undefined): risk is WeatherRisk {
  return Boolean(risk) && risk!.severity !== 'none';
}

/** Empty → `en`, and `sr` → `sr-Latn` (this app's Serbian is Latin script). */
function safeLocale(locale: string | null | undefined): string {
  return resolveIntlLocale(locale);
}

/**
 * `70` → the locale's rendering of 70 %. Never a hard-coded `%`.
 *
 * Re-exported rather than reimplemented: `@/utils/intlPercent` is the single
 * implementation, and it already resolves `sr` to `sr-Latn`.
 */
export const formatPercent = formatIntlPercent;

/** `42` → the locale's rendering of 42 km/h. Never a hard-coded suffix. */
export function formatWindSpeed(value: number, locale: string): string {
  const rounded = Math.round(value);
  try {
    return new Intl.NumberFormat(safeLocale(locale), {
      style: 'unit',
      unit: 'kilometer-per-hour',
      unitDisplay: 'short',
      maximumFractionDigits: 0,
    }).format(rounded);
  } catch {
    return `${rounded} km/h`;
  }
}

/** Clock time in the club's timezone, formatted for the active locale. */
export function formatClockTime(
  isoTime: string,
  locale: string,
  options?: { timeZone?: string | null; hour12?: boolean },
): string {
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(safeLocale(locale), {
      hour: 'numeric',
      minute: '2-digit',
      ...(options?.hour12 === undefined ? {} : { hour12: options.hour12 }),
      ...(options?.timeZone ? { timeZone: options.timeZone } : {}),
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

/**
 * Four hours centred on the game start — one before, the start hour, two after
 * — clamped to whatever the forecast actually has.
 */
export function hourlyStripWindow<T extends { time: string }>(
  hours: readonly T[],
  startTime: string,
  size = 4,
): T[] {
  if (hours.length === 0) return [];
  if (hours.length <= size) return [...hours];
  const start = new Date(startTime).getTime();
  let nearest = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  hours.forEach((hour, index) => {
    const delta = Math.abs(new Date(hour.time).getTime() - start);
    if (delta < bestDelta) {
      bestDelta = delta;
      nearest = index;
    }
  });
  const from = Math.max(0, Math.min(nearest - 1, hours.length - size));
  return hours.slice(from, from + size);
}
