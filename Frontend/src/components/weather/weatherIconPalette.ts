import type { WeatherConditionKey } from '@/types';

export interface WeatherIconPalette {
  iconColor: string;
  surfaceColor: string;
  borderColor: string;
}

const WEATHER_ICON_PALETTES = {
  sun: {
    iconColor: 'rgb(245, 158, 11)',
    surfaceColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(245, 158, 11, 0.22)',
  },
  moon: {
    iconColor: 'rgb(129, 140, 248)',
    surfaceColor: 'rgba(129, 140, 248, 0.16)',
    borderColor: 'rgba(129, 140, 248, 0.24)',
  },
  cloud: {
    iconColor: 'rgb(100, 116, 139)',
    surfaceColor: 'rgba(100, 116, 139, 0.12)',
    borderColor: 'rgba(148, 163, 184, 0.28)',
  },
  fog: {
    iconColor: 'rgb(107, 114, 128)',
    surfaceColor: 'rgba(107, 114, 128, 0.12)',
    borderColor: 'rgba(156, 163, 175, 0.3)',
  },
  rain: {
    iconColor: 'rgb(14, 165, 233)',
    surfaceColor: 'rgba(14, 165, 233, 0.14)',
    borderColor: 'rgba(14, 165, 233, 0.24)',
  },
  freezingRain: {
    iconColor: 'rgb(6, 182, 212)',
    surfaceColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: 'rgba(6, 182, 212, 0.24)',
  },
  snow: {
    iconColor: 'rgb(34, 211, 238)',
    surfaceColor: 'rgba(34, 211, 238, 0.14)',
    borderColor: 'rgba(34, 211, 238, 0.24)',
  },
  thunderstorm: {
    iconColor: 'rgb(124, 58, 237)',
    surfaceColor: 'rgba(124, 58, 237, 0.15)',
    borderColor: 'rgba(124, 58, 237, 0.24)',
  },
  unknown: {
    iconColor: 'rgb(100, 116, 139)',
    surfaceColor: 'rgba(100, 116, 139, 0.1)',
    borderColor: 'rgba(148, 163, 184, 0.24)',
  },
} satisfies Record<string, WeatherIconPalette>;

export function getWeatherIconPalette(conditionKey: WeatherConditionKey, isDay?: boolean | null): WeatherIconPalette {
  switch (conditionKey) {
    case 'clear':
    case 'mainly_clear':
      return isDay === false ? WEATHER_ICON_PALETTES.moon : WEATHER_ICON_PALETTES.sun;
    case 'partly_cloudy':
      return isDay === false ? WEATHER_ICON_PALETTES.moon : WEATHER_ICON_PALETTES.sun;
    case 'cloudy':
      return WEATHER_ICON_PALETTES.cloud;
    case 'fog':
      return WEATHER_ICON_PALETTES.fog;
    case 'drizzle':
    case 'rain':
    case 'showers':
      return WEATHER_ICON_PALETTES.rain;
    case 'freezing_rain':
      return WEATHER_ICON_PALETTES.freezingRain;
    case 'snow':
      return WEATHER_ICON_PALETTES.snow;
    case 'thunderstorm':
      return WEATHER_ICON_PALETTES.thunderstorm;
    default:
      return WEATHER_ICON_PALETTES.unknown;
  }
}
