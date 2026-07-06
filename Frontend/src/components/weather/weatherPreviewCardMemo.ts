import type { WeatherPreviewCardProps } from './WeatherPreviewCard';

export function areWeatherPreviewCardPropsEqual(
  previous: WeatherPreviewCardProps,
  next: WeatherPreviewCardProps,
) {
  const previousEnabled = previous.enabled ?? true;
  const nextEnabled = next.enabled ?? true;

  return previous.cityId === next.cityId
    && previous.cityTimezone === next.cityTimezone
    && previous.startTime === next.startTime
    && previous.endTime === next.endTime
    && previousEnabled === nextEnabled
    && previous.locale === next.locale
    && previous.hour12 === next.hour12
    && (previous.gameWindowHighlight ?? true) === (next.gameWindowHighlight ?? true)
    && (previous.compact ?? false) === (next.compact ?? false)
    && (previous.scope ?? 'game') === (next.scope ?? 'game')
    && previous.archiveDate === next.archiveDate
    && previous.managedForecastPending === next.managedForecastPending
    && previous.managedForecast?.fetchedAt === next.managedForecast?.fetchedAt
    && previous.managedForecast?.summary?.time === next.managedForecast?.summary?.time
    && previous.managedForecast?.available === next.managedForecast?.available;
}
