import { Droplets } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WeatherHourlyPoint } from '@/types';
import {
  formatWeatherPrecipitationAmount,
  getWeatherPrecipitationValue,
  isWeatherPrecipitationActive,
  type WeatherPrecipitationMode,
} from '@/utils/weather';

interface WeatherPrecipitationInlineProps {
  point: Pick<WeatherHourlyPoint, 'precipitationProbability' | 'precipitationMm'>;
  mode: WeatherPrecipitationMode;
  locale: string;
  iconSize?: number;
  className?: string;
}

export function WeatherPrecipitationInline({
  point,
  mode,
  locale,
  iconSize = 11,
  className = 'inline-flex items-center gap-0.5 text-[11px] text-gray-500 dark:text-gray-400',
}: WeatherPrecipitationInlineProps) {
  const { t } = useTranslation();
  const value = getWeatherPrecipitationValue(point, mode);
  if (value == null) return null;

  const label = mode === 'amount'
    ? t('weather.precipitationAmount', {
        amount: formatWeatherPrecipitationAmount(value, locale),
        defaultValue: '{{amount}} mm',
      })
    : `${Math.round(value)}%`;

  return (
    <span
      className={`${className} ${
        isWeatherPrecipitationActive(point, mode)
          ? 'font-medium text-sky-600 dark:text-sky-300'
          : ''
      }`}
    >
      <Droplets size={iconSize} />
      {label}
    </span>
  );
}
