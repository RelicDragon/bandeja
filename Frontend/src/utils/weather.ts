import type { TFunction } from 'i18next';
import type { WeatherConditionKey, WeatherHourlyPoint } from '@/types';

const WEATHER_LABEL_DEFAULTS: Record<WeatherConditionKey, string> = {
  clear: 'Clear',
  mainly_clear: 'Mostly clear',
  partly_cloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  freezing_rain: 'Freezing rain',
  snow: 'Snow',
  showers: 'Showers',
  thunderstorm: 'Thunderstorm',
  unknown: 'Weather',
};

export function getWeatherConditionLabel(t: TFunction, conditionKey: WeatherConditionKey): string {
  return t(`weather.conditions.${conditionKey}`, {
    defaultValue: WEATHER_LABEL_DEFAULTS[conditionKey] ?? WEATHER_LABEL_DEFAULTS.unknown,
  });
}

const FAHRENHEIT_REGIONS = new Set(['US', 'BS', 'BZ', 'KY', 'LR', 'PW']);

function getLocaleRegion(locale: string): string | null {
  const parts = locale.split('-u-')[0].split('-');
  let regionIndex = 1;

  if (/^[a-z]{4}$/i.test(parts[regionIndex] ?? '')) {
    regionIndex += 1;
  }

  const region = parts[regionIndex];
  return region && (/^[a-z]{2}$/i.test(region) || /^\d{3}$/.test(region))
    ? region.toUpperCase()
    : null;
}

function getMeasurementSystemOverride(locale: string): string | null {
  const extension = locale.toLowerCase().split('-u-')[1];
  if (!extension) return null;

  const parts = extension.split('-');
  const measurementSystemIndex = parts.indexOf('ms');
  return measurementSystemIndex >= 0 ? parts[measurementSystemIndex + 1] ?? null : null;
}

export function shouldUseFahrenheit(locale?: string): boolean {
  const resolved = locale || navigator.language || 'en-GB';
  const measurementSystem = getMeasurementSystemOverride(resolved);

  if (measurementSystem === 'ussystem') return true;
  if (measurementSystem === 'metric' || measurementSystem === 'uksystem') return false;

  const region = getLocaleRegion(resolved);
  return region ? FAHRENHEIT_REGIONS.has(region) : false;
}

export type WeatherPrecipitationMode = 'probability' | 'amount';

export function resolveWeatherPrecipitationMode(
  source: 'forecast' | 'archive' | undefined,
): WeatherPrecipitationMode {
  return source === 'archive' ? 'amount' : 'probability';
}

export function getWeatherPrecipitationValue(
  point: Pick<WeatherHourlyPoint, 'precipitationProbability' | 'precipitationMm'>,
  mode: WeatherPrecipitationMode,
): number | null {
  if (mode === 'amount') {
    return typeof point.precipitationMm === 'number' && Number.isFinite(point.precipitationMm)
      ? point.precipitationMm
      : null;
  }

  return typeof point.precipitationProbability === 'number' && Number.isFinite(point.precipitationProbability)
    ? point.precipitationProbability
    : null;
}

export function hasWeatherPrecipitation(
  point: Pick<WeatherHourlyPoint, 'precipitationProbability' | 'precipitationMm'>,
  mode: WeatherPrecipitationMode,
): boolean {
  return getWeatherPrecipitationValue(point, mode) != null;
}

export function isWeatherPrecipitationActive(
  point: Pick<WeatherHourlyPoint, 'precipitationProbability' | 'precipitationMm'>,
  mode: WeatherPrecipitationMode,
): boolean {
  const value = getWeatherPrecipitationValue(point, mode);
  return value != null && value > 0;
}

export function formatWeatherPrecipitationAmount(mm: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(mm);
}

export function formatWeatherTemperature(
  point: Pick<WeatherHourlyPoint, 'temperatureC' | 'temperatureF'>,
  options: { locale?: string; unit?: 'C' | 'F' | 'auto'; compact?: boolean } = {},
): string {
  const unit = options.unit === 'auto' || !options.unit
    ? shouldUseFahrenheit(options.locale) ? 'F' : 'C'
    : options.unit;
  const value = unit === 'F' ? point.temperatureF : point.temperatureC;
  const rounded = Math.round(value);
  return options.compact ? `${rounded}°` : `${rounded}°${unit}`;
}

export interface WeatherTemperatureColor {
  textColor: string;
  iconColor: string;
  markerFill: string;
  markerBorder: string;
  strokeColor: string;
}

const WEATHER_TEMPERATURE_STOPS = [
  { c: -8, rgb: [37, 99, 235] },
  { c: 4, rgb: [14, 165, 233] },
  { c: 16, rgb: [16, 185, 129] },
  { c: 22, rgb: [234, 179, 8] },
  { c: 28, rgb: [249, 115, 22] },
  { c: 36, rgb: [225, 29, 72] },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function interpolateNumber(from: number, to: number, progress: number): number {
  return Math.round(from + (to - from) * progress);
}

function interpolateRgb(from: number[], to: number[], progress: number): string {
  const r = interpolateNumber(from[0], to[0], progress);
  const g = interpolateNumber(from[1], to[1], progress);
  const b = interpolateNumber(from[2], to[2], progress);
  return `rgb(${r}, ${g}, ${b})`;
}

function temperatureColorForCelsius(temperatureC: number): string {
  const fallbackStop = WEATHER_TEMPERATURE_STOPS[2];
  if (!Number.isFinite(temperatureC)) {
    return `rgb(${fallbackStop.rgb.join(', ')})`;
  }

  const firstStop = WEATHER_TEMPERATURE_STOPS[0];
  const lastStop = WEATHER_TEMPERATURE_STOPS[WEATHER_TEMPERATURE_STOPS.length - 1];

  if (temperatureC <= firstStop.c) return `rgb(${firstStop.rgb.join(', ')})`;
  if (temperatureC >= lastStop.c) return `rgb(${lastStop.rgb.join(', ')})`;

  const nextStopIndex = WEATHER_TEMPERATURE_STOPS.findIndex((stop) => temperatureC <= stop.c);
  const previousStop = WEATHER_TEMPERATURE_STOPS[nextStopIndex - 1];
  const nextStop = WEATHER_TEMPERATURE_STOPS[nextStopIndex];
  const progress = clamp((temperatureC - previousStop.c) / (nextStop.c - previousStop.c), 0, 1);

  return interpolateRgb(previousStop.rgb, nextStop.rgb, progress);
}

export function getWeatherTemperatureColor(point: Pick<WeatherHourlyPoint, 'temperatureC'>): WeatherTemperatureColor {
  const color = temperatureColorForCelsius(point.temperatureC);

  return {
    textColor: color,
    iconColor: color,
    markerFill: 'rgb(255, 255, 255)',
    markerBorder: color,
    strokeColor: color,
  };
}

export function formatWeatherTime(
  time: string,
  locale: string,
  hour12: boolean,
  timeZone = 'UTC',
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
    timeZone: timeZone || 'UTC',
  }).format(new Date(time));
}

export function formatWeatherTimezoneLabel(timezone: string, locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: timezone || 'UTC',
      timeZoneName: 'short',
    }).formatToParts(new Date());
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? timezone;
  } catch {
    return timezone;
  }
}

export function getForecastUpdatedLabel(t: TFunction, fetchedAt: string): string {
  const fetched = new Date(fetchedAt).getTime();
  if (!Number.isFinite(fetched)) {
    return t('weather.updatedUnknown', { defaultValue: 'Forecast updated recently' });
  }
  const minutes = Math.max(0, Math.round((Date.now() - fetched) / 60000));
  if (minutes < 2) {
    return t('weather.updatedNow', { defaultValue: 'Updated just now' });
  }
  if (minutes < 60) {
    return t('weather.updatedMinutes', {
      count: minutes,
      defaultValue: 'Updated {{count}} min ago',
    });
  }
  const hours = Math.round(minutes / 60);
  return t('weather.updatedHours', {
    count: hours,
    defaultValue: 'Updated {{count}} hr ago',
  });
}
