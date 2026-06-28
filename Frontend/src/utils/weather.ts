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

export function formatWeatherTime(time: string, locale: string, hour12: boolean): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  }).format(new Date(time));
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
