import { queryOptions, useQuery } from '@tanstack/react-query';
import { weatherApi, type WeatherWindowScope } from '@/api/weather';
import { queryKeys } from '@/queries/queryKeys';

const WEATHER_STALE_MS = 60 * 60 * 1000;

export function weatherDayQueryOptions(cityId: string, date: string, enabled = true) {
  return queryOptions({
    queryKey: queryKeys.weather.day(cityId, date),
    queryFn: () => weatherApi.getDay({ cityId, date }),
    enabled: enabled && Boolean(cityId && date),
    staleTime: WEATHER_STALE_MS,
  });
}

export function gameWeatherQueryOptions(gameId: string, enabled = true, scope: WeatherWindowScope = 'game') {
  return queryOptions({
    queryKey: queryKeys.weather.game(gameId, scope),
    queryFn: () => weatherApi.getGameWeather(gameId, scope),
    enabled: enabled && Boolean(gameId),
    staleTime: WEATHER_STALE_MS,
  });
}

export function weatherPreviewQueryOptions(
  params: {
    cityId?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    scope?: WeatherWindowScope;
  },
  enabled = true,
) {
  const cityId = params.cityId ?? '';
  const startTime = params.startTime ?? '';
  const endTime = params.endTime ?? '';
  const scope = params.scope ?? 'game';
  return queryOptions({
    queryKey: queryKeys.weather.preview(cityId, startTime, endTime, scope),
    queryFn: () => weatherApi.getPreview({ cityId, startTime, endTime, scope }),
    enabled: enabled && Boolean(cityId && startTime && endTime),
    staleTime: WEATHER_STALE_MS,
  });
}

export function useWeatherDayQuery(cityId: string, date: string, enabled = true) {
  return useQuery(weatherDayQueryOptions(cityId, date, enabled));
}

export function useGameWeatherQuery(gameId: string, enabled = true, scope: WeatherWindowScope = 'game') {
  return useQuery(gameWeatherQueryOptions(gameId, enabled, scope));
}

export function useWeatherPreviewQuery(
  params: {
    cityId?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    scope?: WeatherWindowScope;
  },
  enabled = true,
) {
  return useQuery(weatherPreviewQueryOptions(params, enabled));
}
