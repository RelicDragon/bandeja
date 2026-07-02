import type { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';

const PROVIDER = 'open-meteo';
const CACHE_TTL_MS = 60 * 60 * 1000;
const STALE_FALLBACK_MS = 12 * 60 * 60 * 1000;
const FORECAST_DAYS = 10;
const FETCH_TIMEOUT_MS = 8000;
const HOUR_MS = 60 * 60 * 1000;

export type WeatherConditionKey =
  | 'clear'
  | 'mainly_clear'
  | 'partly_cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'freezing_rain'
  | 'snow'
  | 'showers'
  | 'thunderstorm'
  | 'unknown';

export interface WeatherHourlyPoint {
  time: string;
  temperatureC: number;
  temperatureF: number;
  weatherCode: number;
  conditionKey: WeatherConditionKey;
  precipitationProbability: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  relativeHumidity: number | null;
  isDay: boolean | null;
}

export interface WeatherForecastPayload {
  provider: typeof PROVIDER;
  cityId: string;
  cityName: string;
  cityTimezone: string;
  latitude: number;
  longitude: number;
  fetchedAt: string;
  forecastStart: string;
  forecastEnd: string;
  hourly: WeatherHourlyPoint[];
}

export interface WeatherSummaryDto extends WeatherHourlyPoint {
  provider: typeof PROVIDER;
  fetchedAt: string;
  stale: boolean;
}

export interface WeatherWindowDto {
  provider: typeof PROVIDER;
  cityId: string;
  cityName: string;
  cityTimezone: string;
  fetchedAt: string;
  stale: boolean;
  source: 'forecast' | 'historical';
  available: boolean;
  summary: WeatherSummaryDto | null;
  hours: WeatherHourlyPoint[];
  attribution: 'Open-Meteo';
  unavailableReason?: 'missing_city_coordinates' | 'out_of_range' | 'not_scheduled';
}

export type WeatherWindowScope = 'game' | 'day' | 'forecast';

type CityForWeather = {
  id: string;
  name: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
};

type CacheLike = {
  payload: unknown;
  fetchedAt: Date;
  expiresAt: Date;
  forecastStart: Date;
  forecastEnd: Date;
};

type GameForWeatherSnapshot = {
  id: string;
  cityId: string;
  startTime: Date | string;
  endTime: Date | string;
  timeIsSet: boolean;
};

type WeatherSnapshotLike = {
  gameId: string;
  cityId: string;
  cityName: string;
  cityTimezone: string;
  provider: string;
  gameStartTime: Date;
  gameEndTime: Date;
  fetchedAt: Date;
  capturedAt: Date;
  summary: unknown;
  hours: unknown;
};

const inFlightByCity = new Map<string, Promise<CacheLike>>();

function cToF(c: number): number {
  return Math.round(((c * 9) / 5 + 32) * 10) / 10;
}

function roundOne(n: number): number {
  return Math.round(n * 10) / 10;
}

export function conditionKeyForWeatherCode(code: number): WeatherConditionKey {
  if (code === 0) return 'clear';
  if (code === 1) return 'mainly_clear';
  if (code === 2) return 'partly_cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65].includes(code)) return 'rain';
  if ([66, 67].includes(code)) return 'freezing_rain';
  if ([71, 73, 75, 77].includes(code)) return 'snow';
  if ([80, 81, 82].includes(code)) return 'showers';
  if ([85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunderstorm';
  return 'unknown';
}

function parseUtcHour(value: string): Date {
  return new Date(value.endsWith('Z') ? value : `${value}Z`);
}

function normalizeOpenMeteoPayload(city: CityForWeather, body: any, fetchedAt: Date): WeatherForecastPayload {
  const times: string[] = Array.isArray(body?.hourly?.time) ? body.hourly.time : [];
  const temps: number[] = Array.isArray(body?.hourly?.temperature_2m) ? body.hourly.temperature_2m : [];
  const codes: number[] = Array.isArray(body?.hourly?.weather_code) ? body.hourly.weather_code : [];
  const precipitationProbability: Array<number | null> = Array.isArray(body?.hourly?.precipitation_probability)
    ? body.hourly.precipitation_probability
    : [];
  const precipitation: Array<number | null> = Array.isArray(body?.hourly?.precipitation)
    ? body.hourly.precipitation
    : [];
  const windSpeed: Array<number | null> = Array.isArray(body?.hourly?.wind_speed_10m)
    ? body.hourly.wind_speed_10m
    : [];
  const humidity: Array<number | null> = Array.isArray(body?.hourly?.relative_humidity_2m)
    ? body.hourly.relative_humidity_2m
    : [];
  const isDay: Array<number | null> = Array.isArray(body?.hourly?.is_day) ? body.hourly.is_day : [];

  const hourly = times.flatMap((time, index): WeatherHourlyPoint[] => {
    const parsed = parseUtcHour(time);
    const temperatureC = temps[index];
    const weatherCode = codes[index];
    if (Number.isNaN(parsed.getTime()) || typeof temperatureC !== 'number' || typeof weatherCode !== 'number') {
      return [];
    }

    const probability = precipitationProbability[index];
    const precipitationMm = precipitation[index];
    const windSpeedKmh = windSpeed[index];
    const relativeHumidity = humidity[index];
    const dayFlag = isDay[index];

    return [{
      time: parsed.toISOString(),
      temperatureC: roundOne(temperatureC),
      temperatureF: cToF(temperatureC),
      weatherCode,
      conditionKey: conditionKeyForWeatherCode(weatherCode),
      precipitationProbability: typeof probability === 'number' ? Math.round(probability) : null,
      precipitationMm: typeof precipitationMm === 'number' ? roundOne(precipitationMm) : null,
      windSpeedKmh: typeof windSpeedKmh === 'number' ? roundOne(windSpeedKmh) : null,
      relativeHumidity: typeof relativeHumidity === 'number' ? Math.round(relativeHumidity) : null,
      isDay: typeof dayFlag === 'number' ? dayFlag === 1 : null,
    }];
  });

  if (hourly.length === 0) {
    throw new Error('Open-Meteo returned no usable hourly forecast rows');
  }

  return {
    provider: PROVIDER,
    cityId: city.id,
    cityName: city.name,
    cityTimezone: city.timezone,
    latitude: city.latitude as number,
    longitude: city.longitude as number,
    fetchedAt: fetchedAt.toISOString(),
    forecastStart: hourly[0].time,
    forecastEnd: hourly[hourly.length - 1].time,
    hourly,
  };
}

function getPayload(cache: CacheLike): WeatherForecastPayload {
  return cache.payload as WeatherForecastPayload;
}

function isFresh(cache: CacheLike, now: Date): boolean {
  return cache.expiresAt.getTime() > now.getTime();
}

function isUsablyStale(cache: CacheLike, now: Date): boolean {
  return now.getTime() - cache.fetchedAt.getTime() <= STALE_FALLBACK_MS;
}

async function fetchOpenMeteoForecast(city: CityForWeather): Promise<WeatherForecastPayload> {
  if (city.latitude == null || city.longitude == null) {
    throw new ApiError(400, 'City is missing coordinates');
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(city.latitude));
  url.searchParams.set('longitude', String(city.longitude));
  url.searchParams.set(
    'hourly',
    [
      'temperature_2m',
      'weather_code',
      'precipitation_probability',
      'precipitation',
      'wind_speed_10m',
      'relative_humidity_2m',
      'is_day',
    ].join(','),
  );
  url.searchParams.set('forecast_days', String(FORECAST_DAYS));
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('wind_speed_unit', 'kmh');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Bandeja/WeatherForecastCache',
      },
    });
    if (!response.ok) {
      throw new Error(`Open-Meteo responded ${response.status}`);
    }
    const body = await response.json();
    return normalizeOpenMeteoPayload(city, body, new Date());
  } finally {
    clearTimeout(timeout);
  }
}

async function readCity(cityId: string): Promise<CityForWeather> {
  const city = await prisma.city.findUnique({
    where: { id: cityId },
    select: {
      id: true,
      name: true,
      timezone: true,
      latitude: true,
      longitude: true,
    },
  });

  if (!city) {
    throw new ApiError(404, 'City not found');
  }

  return city;
}

function cacheFromPayload(payload: WeatherForecastPayload): {
  forecastStart: Date;
  forecastEnd: Date;
  fetchedAt: Date;
  expiresAt: Date;
  payload: Prisma.InputJsonValue;
} {
  const fetchedAt = new Date(payload.fetchedAt);
  return {
    forecastStart: new Date(payload.forecastStart),
    forecastEnd: new Date(payload.forecastEnd),
    fetchedAt,
    expiresAt: new Date(fetchedAt.getTime() + CACHE_TTL_MS),
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}

async function refreshCache(city: CityForWeather): Promise<CacheLike> {
  const payload = await fetchOpenMeteoForecast(city);
  const data = cacheFromPayload(payload);
  return prisma.weatherForecastCache.upsert({
    where: {
      cityId_provider: {
        cityId: city.id,
        provider: PROVIDER,
      },
    },
    create: {
      cityId: city.id,
      provider: PROVIDER,
      ...data,
      lastError: null,
    },
    update: {
      ...data,
      lastError: null,
    },
  });
}

async function markRefreshError(cityId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  try {
    await prisma.weatherForecastCache.update({
      where: {
        cityId_provider: {
          cityId,
          provider: PROVIDER,
        },
      },
      data: { lastError: message },
    });
  } catch {
    // Cache row may not exist yet. The caller will return unavailable.
  }
}

async function getCacheForCity(cityId: string): Promise<{ cache: CacheLike | null; stale: boolean; unavailableReason?: 'missing_city_coordinates' }> {
  const now = new Date();
  const city = await readCity(cityId);

  if (city.latitude == null || city.longitude == null) {
    return { cache: null, stale: false, unavailableReason: 'missing_city_coordinates' };
  }

  const existing = await prisma.weatherForecastCache.findUnique({
    where: {
      cityId_provider: {
        cityId,
        provider: PROVIDER,
      },
    },
  });

  if (existing && isFresh(existing, now)) {
    return { cache: existing, stale: false };
  }

  if (existing) {
    await persistCompletedGameSnapshotsFromCache(existing, now).catch((error) => {
      console.warn('[WeatherForecastService] Failed to snapshot completed game weather', {
        cityId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  const inFlightKey = `${PROVIDER}:${cityId}`;
  let refresh = inFlightByCity.get(inFlightKey);
  if (!refresh) {
    refresh = refreshCache(city).finally(() => {
      inFlightByCity.delete(inFlightKey);
    });
    inFlightByCity.set(inFlightKey, refresh);
  }

  try {
    const cache = await refresh;
    return { cache, stale: false };
  } catch (error) {
    await markRefreshError(cityId, error);
    if (existing && isUsablyStale(existing, now)) {
      return { cache: existing, stale: true };
    }
    return { cache: null, stale: false };
  }
}

function nearestPoint(payload: WeatherForecastPayload, at: Date): WeatherHourlyPoint | null {
  const target = at.getTime();
  let best: WeatherHourlyPoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const point of payload.hourly) {
    const distance = Math.abs(new Date(point.time).getTime() - target);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }

  return bestDistance <= 90 * 60 * 1000 ? best : null;
}

export function hourlyWindow(payload: WeatherForecastPayload, startTime: Date, endTime: Date): WeatherHourlyPoint[] {
  const from = startTime.getTime() - HOUR_MS;
  const end = endTime.getTime();
  const endRemainder = end % HOUR_MS;
  const to = endRemainder === 0 ? end : end + HOUR_MS - endRemainder;

  return payload.hourly.filter((point) => {
    const time = new Date(point.time).getTime();
    return time >= from && time <= to;
  });
}

function dateKeyInTimezone(date: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function fullDayWindow(payload: WeatherForecastPayload, startTime: Date, endTime: Date): WeatherHourlyPoint[] {
  const startDayKey = dateKeyInTimezone(startTime, payload.cityTimezone);
  const gameWindowTimes = new Set(hourlyWindow(payload, startTime, endTime).map((point) => point.time));

  return payload.hourly.filter((point) => {
    if (gameWindowTimes.has(point.time)) return true;

    const time = new Date(point.time);
    if (Number.isNaN(time.getTime())) return false;

    return dateKeyInTimezone(time, payload.cityTimezone) === startDayKey;
  });
}

function buildSummary(cache: CacheLike, stale: boolean, at: Date): WeatherSummaryDto | null {
  const payload = getPayload(cache);
  const point = nearestPoint(payload, at);
  if (!point) return null;
  return {
    ...point,
    provider: PROVIDER,
    fetchedAt: cache.fetchedAt.toISOString(),
    stale,
  };
}

function buildWindowFromCache(
  cache: CacheLike,
  stale: boolean,
  startTime: Date,
  endTime: Date,
  scope: WeatherWindowScope = 'game',
): WeatherWindowDto {
  const payload = getPayload(cache);
  const hours = scope === 'forecast'
    ? payload.hourly
    : scope === 'day'
      ? fullDayWindow(payload, startTime, endTime)
      : hourlyWindow(payload, startTime, endTime);
  const summary = buildSummary(cache, stale, startTime);
  const available = scope === 'forecast'
    ? hours.length > 0
    : Boolean(summary && hours.length > 0);

  return {
    provider: PROVIDER,
    cityId: payload.cityId,
    cityName: payload.cityName,
    cityTimezone: payload.cityTimezone,
    fetchedAt: cache.fetchedAt.toISOString(),
    stale,
    source: 'forecast',
    available,
    summary,
    hours,
    attribution: 'Open-Meteo',
    ...(available ? {} : { unavailableReason: 'out_of_range' as const }),
  };
}

function isWeatherHourlyPoint(value: unknown): value is WeatherHourlyPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as WeatherHourlyPoint;
  return typeof point.time === 'string'
    && typeof point.temperatureC === 'number'
    && typeof point.temperatureF === 'number'
    && typeof point.weatherCode === 'number'
    && typeof point.conditionKey === 'string';
}

function weatherHoursFromJson(value: unknown): WeatherHourlyPoint[] {
  return Array.isArray(value) ? value.filter(isWeatherHourlyPoint) : [];
}

function buildSummaryFromSnapshot(snapshot: WeatherSnapshotLike): WeatherSummaryDto | null {
  if (!isWeatherHourlyPoint(snapshot.summary)) return null;
  return {
    ...snapshot.summary,
    provider: PROVIDER,
    fetchedAt: snapshot.fetchedAt.toISOString(),
    stale: false,
  };
}

function snapshotMatchesGame(snapshot: WeatherSnapshotLike, game: GameForWeatherSnapshot): boolean {
  return snapshot.cityId === game.cityId
    && snapshot.gameStartTime.getTime() === new Date(game.startTime).getTime()
    && snapshot.gameEndTime.getTime() === new Date(game.endTime).getTime();
}

function buildWindowFromSnapshot(snapshot: WeatherSnapshotLike): WeatherWindowDto {
  const hours = weatherHoursFromJson(snapshot.hours);
  const summary = buildSummaryFromSnapshot(snapshot);
  const available = Boolean(summary && hours.length > 0);

  return {
    provider: PROVIDER,
    cityId: snapshot.cityId,
    cityName: snapshot.cityName,
    cityTimezone: snapshot.cityTimezone,
    fetchedAt: snapshot.fetchedAt.toISOString(),
    stale: false,
    source: 'historical',
    available,
    summary,
    hours,
    attribution: 'Open-Meteo',
    ...(available ? {} : { unavailableReason: 'out_of_range' as const }),
  };
}

async function readSnapshotForGame(game: GameForWeatherSnapshot): Promise<WeatherSnapshotLike | null> {
  const snapshot = await prisma.gameWeatherSnapshot.findUnique({
    where: { gameId: game.id },
  });

  if (!snapshot) return null;
  if (snapshotMatchesGame(snapshot, game)) return snapshot;

  await prisma.gameWeatherSnapshot.delete({ where: { gameId: game.id } }).catch(() => undefined);
  return null;
}

function buildSnapshotPayload(game: GameForWeatherSnapshot, cache: CacheLike): {
  cityId: string;
  provider: typeof PROVIDER;
  source: 'forecast';
  cityName: string;
  cityTimezone: string;
  gameStartTime: Date;
  gameEndTime: Date;
  fetchedAt: Date;
  summary: Prisma.InputJsonValue;
  hours: Prisma.InputJsonValue;
} | null {
  if (!game.timeIsSet) return null;

  const startTime = new Date(game.startTime);
  const endTime = new Date(game.endTime);
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) return null;

  const payload = getPayload(cache);
  if (payload.cityId !== game.cityId) return null;

  const summary = buildSummary(cache, false, startTime);
  const hours = hourlyWindow(payload, startTime, endTime);
  if (!summary || hours.length === 0) return null;

  const summaryPoint: WeatherHourlyPoint = {
    time: summary.time,
    temperatureC: summary.temperatureC,
    temperatureF: summary.temperatureF,
    weatherCode: summary.weatherCode,
    conditionKey: summary.conditionKey,
    precipitationProbability: summary.precipitationProbability,
    precipitationMm: summary.precipitationMm,
    windSpeedKmh: summary.windSpeedKmh,
    relativeHumidity: summary.relativeHumidity,
    isDay: summary.isDay,
  };

  return {
    cityId: payload.cityId,
    provider: PROVIDER,
    source: 'forecast',
    cityName: payload.cityName,
    cityTimezone: payload.cityTimezone,
    gameStartTime: startTime,
    gameEndTime: endTime,
    fetchedAt: cache.fetchedAt,
    summary: summaryPoint as unknown as Prisma.InputJsonValue,
    hours: hours as unknown as Prisma.InputJsonValue,
  };
}

async function upsertSnapshotForGameFromCache(game: GameForWeatherSnapshot, cache: CacheLike): Promise<WeatherSnapshotLike | null> {
  const data = buildSnapshotPayload(game, cache);
  if (!data) return null;

  return prisma.gameWeatherSnapshot.upsert({
    where: { gameId: game.id },
    create: {
      gameId: game.id,
      ...data,
    },
    update: data,
  });
}

async function persistCompletedGameSnapshotsFromCache(cache: CacheLike, now: Date): Promise<void> {
  const payload = getPayload(cache);
  const games = await prisma.game.findMany({
    where: {
      cityId: payload.cityId,
      timeIsSet: true,
      endTime: { lte: now },
      startTime: {
        gte: cache.forecastStart,
        lte: cache.forecastEnd,
      },
      weatherSnapshot: { is: null },
    },
    select: {
      id: true,
      cityId: true,
      startTime: true,
      endTime: true,
      timeIsSet: true,
    },
  });

  await Promise.all(games.map((game) => upsertSnapshotForGameFromCache(game, cache)));
}

export class WeatherForecastService {
  static async warmCityForecast(cityId: string): Promise<void> {
    await getCacheForCity(cityId);
  }

  static async getSummaryForGame(game: {
    id?: string;
    cityId: string;
    startTime: Date | string;
    endTime?: Date | string;
    timeIsSet: boolean;
  }): Promise<WeatherSummaryDto | null> {
    if (!game.timeIsSet) return null;

    const startTime = new Date(game.startTime);
    if (Number.isNaN(startTime.getTime())) return null;

    if (game.id && game.endTime) {
      const snapshot = await readSnapshotForGame({
        id: game.id,
        cityId: game.cityId,
        startTime: game.startTime,
        endTime: game.endTime,
        timeIsSet: game.timeIsSet,
      });
      if (snapshot) {
        return buildSummaryFromSnapshot(snapshot);
      }
    }

    const { cache, stale } = await getCacheForCity(game.cityId);
    if (!cache) return null;

    const summary = buildSummary(cache, stale, startTime);
    if (summary && game.id && game.endTime && new Date(game.endTime).getTime() <= Date.now()) {
      await upsertSnapshotForGameFromCache({
        id: game.id,
        cityId: game.cityId,
        startTime: game.startTime,
        endTime: game.endTime,
        timeIsSet: game.timeIsSet,
      }, cache).catch((error) => {
        console.warn('[WeatherForecastService] Failed to snapshot game weather summary', {
          gameId: game.id,
          cityId: game.cityId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    return summary;
  }

  static async attachSummariesToGames<T extends {
    id: string;
    cityId: string;
    startTime: Date | string;
    endTime: Date | string;
    timeIsSet: boolean;
  }>(games: T[]): Promise<Array<T & { weatherSummary?: WeatherSummaryDto | null }>> {
    const eligible = games.filter((game) => game.timeIsSet);
    if (eligible.length === 0) return games;

    const snapshots = await prisma.gameWeatherSnapshot.findMany({
      where: {
        gameId: {
          in: eligible.map((game) => game.id),
        },
      },
    });
    const snapshotsByGameId = new Map(snapshots.map((snapshot) => [snapshot.gameId, snapshot]));

    const cityCaches = new Map<string, Awaited<ReturnType<typeof getCacheForCity>>>();
    await Promise.all(
      Array.from(new Set(eligible.filter((game) => {
        const snapshot = snapshotsByGameId.get(game.id);
        return !snapshot || !snapshotMatchesGame(snapshot, game);
      }).map((game) => game.cityId))).map(async (cityId) => {
        try {
          cityCaches.set(cityId, await getCacheForCity(cityId));
        } catch (error) {
          console.warn('[WeatherForecastService] Failed to attach weather summary', {
            cityId,
            error: error instanceof Error ? error.message : String(error),
          });
          cityCaches.set(cityId, { cache: null, stale: false });
        }
      }),
    );

    return games.map((game) => {
      if (!game.timeIsSet) return game;
      const snapshot = snapshotsByGameId.get(game.id);
      if (snapshot && snapshotMatchesGame(snapshot, game)) {
        return { ...game, weatherSummary: buildSummaryFromSnapshot(snapshot) };
      }
      const cityCache = cityCaches.get(game.cityId);
      if (!cityCache?.cache) return { ...game, weatherSummary: null };
      const summary = buildSummary(cityCache.cache, cityCache.stale, new Date(game.startTime));
      if (summary && new Date(game.endTime).getTime() <= Date.now()) {
        upsertSnapshotForGameFromCache(game, cityCache.cache).catch((error) => {
          console.warn('[WeatherForecastService] Failed to snapshot attached game weather', {
            gameId: game.id,
            cityId: game.cityId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
      return {
        ...game,
        weatherSummary: summary,
      };
    });
  }

  static async getWindowForCity(params: {
    cityId: string;
    startTime: Date | string;
    endTime: Date | string;
    timeIsSet?: boolean;
    scope?: WeatherWindowScope;
  }): Promise<WeatherWindowDto> {
    const startTime = new Date(params.startTime);
    const endTime = new Date(params.endTime);
    if (params.timeIsSet === false) {
      return {
        provider: PROVIDER,
        cityId: params.cityId,
        cityName: '',
        cityTimezone: '',
        fetchedAt: new Date(0).toISOString(),
        stale: false,
        source: 'forecast',
        available: false,
        summary: null,
        hours: [],
        attribution: 'Open-Meteo',
        unavailableReason: 'not_scheduled',
      };
    }
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new ApiError(400, 'Valid startTime and endTime are required');
    }

    const { cache, stale, unavailableReason } = await getCacheForCity(params.cityId);
    if (!cache) {
      return {
        provider: PROVIDER,
        cityId: params.cityId,
        cityName: '',
        cityTimezone: '',
        fetchedAt: new Date(0).toISOString(),
        stale: false,
        source: 'forecast',
        available: false,
        summary: null,
        hours: [],
        attribution: 'Open-Meteo',
        unavailableReason: unavailableReason ?? 'out_of_range',
      };
    }

    return buildWindowFromCache(cache, stale, startTime, endTime, params.scope);
  }

  static async getWindowForGame(gameId: string, scope: WeatherWindowScope = 'game'): Promise<WeatherWindowDto> {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        cityId: true,
        startTime: true,
        endTime: true,
        timeIsSet: true,
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    if (!game.timeIsSet) {
      return WeatherForecastService.getWindowForCity({ ...game, scope });
    }

    const snapshot = await readSnapshotForGame({ id: gameId, ...game });
    if (snapshot) {
      return buildWindowFromSnapshot(snapshot);
    }

    const window = await WeatherForecastService.getWindowForCity({ ...game, scope });
    if (window.available && game.endTime.getTime() <= Date.now()) {
      const { cache } = await getCacheForCity(game.cityId);
      if (cache) {
        await upsertSnapshotForGameFromCache({ id: gameId, ...game }, cache).catch((error) => {
          console.warn('[WeatherForecastService] Failed to snapshot game weather window', {
            gameId,
            cityId: game.cityId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }

    return window;
  }

  static async clearGameWeatherSnapshot(gameId: string): Promise<void> {
    await prisma.gameWeatherSnapshot.delete({ where: { gameId } }).catch(() => undefined);
  }
}
