import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from 'lucide-react';
import type { WeatherConditionKey } from '@/types';

interface WeatherIconProps {
  conditionKey: WeatherConditionKey;
  isDay?: boolean | null;
  size?: number;
  className?: string;
}

export function WeatherIcon({ conditionKey, isDay, size = 16, className = '' }: WeatherIconProps) {
  const common = { size, className };
  switch (conditionKey) {
    case 'clear':
    case 'mainly_clear':
      return isDay === false ? <CloudSun {...common} /> : <Sun {...common} />;
    case 'partly_cloudy':
      return <CloudSun {...common} />;
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
