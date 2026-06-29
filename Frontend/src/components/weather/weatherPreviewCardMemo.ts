import type { WeatherPreviewCardProps } from './WeatherPreviewCard';

export function areWeatherPreviewCardPropsEqual(
  previous: WeatherPreviewCardProps,
  next: WeatherPreviewCardProps,
) {
  const previousEnabled = previous.enabled ?? true;
  const nextEnabled = next.enabled ?? true;

  return previous.cityId === next.cityId
    && previous.startTime === next.startTime
    && previous.endTime === next.endTime
    && previousEnabled === nextEnabled
    && previous.locale === next.locale
    && previous.hour12 === next.hour12;
}
