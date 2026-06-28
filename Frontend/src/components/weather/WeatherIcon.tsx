import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudMoon,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
} from 'lucide-react';
import type { WeatherConditionKey } from '@/types';
import { getWeatherIconPalette } from './weatherIconPalette';

interface WeatherIconProps {
  conditionKey: WeatherConditionKey;
  isDay?: boolean | null;
  size?: number;
  className?: string;
}

export function WeatherIcon({ conditionKey, isDay, size = 16, className = '' }: WeatherIconProps) {
  const palette = getWeatherIconPalette(conditionKey, isDay);
  const common = {
    size,
    className,
    style: { color: palette.iconColor },
    strokeWidth: 2.15,
    'aria-hidden': true,
  };

  switch (conditionKey) {
    case 'clear':
    case 'mainly_clear':
      return isDay === false ? <Moon {...common} /> : <Sun {...common} />;
    case 'partly_cloudy':
      return isDay === false ? <CloudMoon {...common} /> : <CloudSun {...common} />;
    case 'cloudy':
      return <Cloud {...common} />;
    case 'fog':
      return <CloudFog {...common} />;
    case 'drizzle':
      return <CloudDrizzle {...common} />;
    case 'rain':
    case 'freezing_rain':
    case 'showers':
      return <CloudRain {...common} />;
    case 'snow':
      return <CloudSnow {...common} />;
    case 'thunderstorm':
      return <CloudLightning {...common} />;
    default:
      return <CloudSun {...common} />;
  }
}
