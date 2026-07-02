import type { Prisma } from '@prisma/client';
import { fromZonedTime } from 'date-fns-tz';
import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import {
  conditionKeyForWeatherCode,
  dateKeyInTimezone,
  filterHourlyByDayKey,
  getForecastDay,
  type WeatherHourlyPoint,
} from './weatherForecast.service';

const PROVIDER = 'open-meteo';
const FETCH_TIMEOUT_MS = 15000;
const FORECAST_LOOKAHEAD_DAYS = 10;

export interface WeatherDayDto {
  provider: typeof PROVIDER;
  cityId: string;
  cityName: string;
  cityTimezone: string;
  date: string;
  fetchedAt: string;
  stale: boolean;
  source: 'forecast' | 'archive';
  available: boolean;
  hours: WeatherHourlyPoint[];
  attribution: 'Open-Meteo';
  unavailableReason?: 'missing_city_coordinates' | 'out_of_range';
}

type CityForWeather = {
  id: string;
  name: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
};

const inFlightByCityDay = new Map<string, Promise<WeatherHourlyPoint[]>>();

function roundOne(n: number): number {
  return Math.round(n * 10) / 10;
}

function cToF(c: number): number {
  return Math.round(((c * 9) / 5 + 32) * 10) / 10;
}

function isValidDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays, 12));
  return shifted.toISOString().slice(0, 10);
}

export function maxForecastDayKey(timezone: string): string {
  return shiftDayKey(dateKeyInTimezone(new Date(), timezone), FORECAST_LOOKAHEAD_DAYS - 1);
}

function compareDayKeys(left: string, right: string): number {
  return left.localeCompare(right);
}

function parseLocalHour(value: string, timezone: string): Date {
  if (value.endsWith('Z')) return new Date(value);
  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute = 0] = timePart.split(':').map(Number);
  return fromZonedTime(new Date(year, month - 1, day, hour, minute, 0, 0), timezone);
}

function normalizeArchiveHourly(body: unknown, timezone: string): WeatherHourlyPoint[] {
  const hourly = (body as { hourly?: Record<string, unknown> })?.hourly;
  const times: string[] = Array.isArray(hourly?.time) ? hourly.time as string[] : [];
  const temps: number[] = Array.isArray(hourly?.temperature_2m) ? hourly.temperature_2m as number[] : [];
  const codes: number[] = Array.isArray(hourly?.weather_code) ? hourly.weather_code as number[] : [];
  const precipitation: Array<number | null> = Array.isArray(hourly?.precipitation)
    ? hourly.precipitation as Array<number | null>
    : [];
  const windSpeed: Array<number | null> = Array.isArray(hourly?.wind_speed_10m)
    ? hourly.wind_speed_10m as Array<number | null>
    : [];
  const humidity: Array<number | null> = Array.isArray(hourly?.relative_humidity_2m)
    ? hourly.relative_humidity_2m as Array<number | null>
    : [];

  const isDay: Array<number | null> = Array.isArray(hourly?.is_day) ? hourly.is_day as Array<number | null> : [];

  return times.flatMap((time, index): WeatherHourlyPoint[] => {
    const parsed = parseLocalHour(time, timezone);
    const temperatureC = temps[index];
    const weatherCode = codes[index];
    if (Number.isNaN(parsed.getTime()) || typeof temperatureC !== 'number' || typeof weatherCode !== 'number') {
      return [];
    }

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
      precipitationProbability: null,
      precipitationMm: typeof precipitationMm === 'number' ? roundOne(precipitationMm) : null,
      windSpeedKmh: typeof windSpeedKmh === 'number' ? roundOne(windSpeedKmh) : null,
      relativeHumidity: typeof relativeHumidity === 'number' ? Math.round(relativeHumidity) : null,
      isDay: typeof dayFlag === 'number' ? dayFlag === 1 : null,
    }];
  });
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

async function fetchArchiveDayFromOpenMeteo(city: CityForWeather, day: string): Promise<WeatherHourlyPoint[]> {
  if (city.latitude == null || city.longitude == null) {
    throw new ApiError(400, 'City is missing coordinates');
  }

  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.searchParams.set('latitude', String(city.latitude));
  url.searchParams.set('longitude', String(city.longitude));
  url.searchParams.set('start_date', day);
  url.searchParams.set('end_date', day);
  url.searchParams.set(
    'hourly',
    ['temperature_2m', 'weather_code', 'precipitation', 'wind_speed_10m', 'relative_humidity_2m', 'is_day'].join(','),
  );
  url.searchParams.set('timezone', city.timezone);
  url.searchParams.set('wind_speed_unit', 'kmh');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Bandeja/WeatherDayArchive',
      },
    });
    if (!response.ok) {
      throw new Error(`Open-Meteo archive responded ${response.status}`);
    }
    const body = await response.json();
    const hourly = normalizeArchiveHourly(body, city.timezone);
    if (hourly.length === 0) {
      throw new Error(`Open-Meteo archive returned no hourly rows for ${day}`);
    }
    return hourly;
  } finally {
    clearTimeout(timeout);
  }
}

async function persistArchiveDay(
  city: CityForWeather,
  day: string,
  hours: WeatherHourlyPoint[],
  fetchedAt: Date,
): Promise<void> {
  try {
    await prisma.weatherDayArchive.create({
      data: {
        cityId: city.id,
        provider: PROVIDER,
        day,
        cityTimezone: city.timezone,
        fetchedAt,
        hours: hours as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    const isUniqueViolation = error instanceof Error
      && 'code' in error
      && (error as { code?: string }).code === 'P2002';
    if (!isUniqueViolation) throw error;
  }
}

async function readArchivedDayFromDb(city: CityForWeather, day: string): Promise<{
  hours: WeatherHourlyPoint[];
  fetchedAt: Date;
} | null> {
  return loadArchivedDayHours(city, day);
}

async function loadArchivedDayHours(city: CityForWeather, day: string): Promise<{
  hours: WeatherHourlyPoint[];
  fetchedAt: Date;
} | null> {
  const row = await prisma.weatherDayArchive.findUnique({
    where: {
      cityId_provider_day: {
        cityId: city.id,
        provider: PROVIDER,
        day,
      },
    },
  });
  if (!row) return null;

  const hours = filterHourlyByDayKey(weatherHoursFromJson(row.hours), day, city.timezone);
  if (hours.length === 0) return null;

  return { hours, fetchedAt: row.fetchedAt };
}

async function ensureArchivedDayHours(city: CityForWeather, day: string): Promise<{
  hours: WeatherHourlyPoint[];
  fetchedAt: Date;
}> {
  const cached = await loadArchivedDayHours(city, day);
  if (cached) return cached;

  const inFlightKey = `${PROVIDER}:${city.id}:${day}`;
  let fetchPromise = inFlightByCityDay.get(inFlightKey);
  if (!fetchPromise) {
    fetchPromise = fetchArchiveDayFromOpenMeteo(city, day).finally(() => {
      inFlightByCityDay.delete(inFlightKey);
    });
    inFlightByCityDay.set(inFlightKey, fetchPromise);
  }

  const fetchedAt = new Date();
  const hourly = await fetchPromise;
  const hours = filterHourlyByDayKey(hourly, day, city.timezone);
  if (hours.length === 0) {
    throw new Error(`Archive fetch returned no hours for ${day} in ${city.timezone}`);
  }

  await persistArchiveDay(city, day, hours, fetchedAt);

  const stored = await loadArchivedDayHours(city, day);
  if (stored) return stored;

  return { hours, fetchedAt };
}

function weatherHoursFromJson(value: unknown): WeatherHourlyPoint[] {
  if (!Array.isArray(value)) return [];
  return value.filter((point): point is WeatherHourlyPoint => {
    if (!point || typeof point !== 'object') return false;
    const row = point as WeatherHourlyPoint;
    return typeof row.time === 'string'
      && typeof row.temperatureC === 'number'
      && typeof row.weatherCode === 'number';
  });
}

function summaryFromHours(
  hours: WeatherHourlyPoint[],
  at: Date,
): WeatherHourlyPoint | null {
  const target = at.getTime();
  let best: WeatherHourlyPoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of hours) {
    const distance = Math.abs(new Date(point.time).getTime() - target);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return bestDistance <= 90 * 60 * 1000 ? best : null;
}

function unavailableDay(city: CityForWeather, date: string, reason: WeatherDayDto['unavailableReason']): WeatherDayDto {
  return {
    provider: PROVIDER,
    cityId: city.id,
    cityName: city.name,
    cityTimezone: city.timezone,
    date,
    fetchedAt: new Date(0).toISOString(),
    stale: false,
    source: 'archive',
    available: false,
    hours: [],
    attribution: 'Open-Meteo',
    unavailableReason: reason,
  };
}

export class WeatherDayArchiveService {
  static async getDay(cityId: string, date: string): Promise<WeatherDayDto> {
    if (!isValidDayKey(date)) {
      throw new ApiError(400, 'date must be YYYY-MM-DD');
    }

    const city = await readCity(cityId);
    if (city.latitude == null || city.longitude == null) {
      return unavailableDay(city, date, 'missing_city_coordinates');
    }

    const todayKey = dateKeyInTimezone(new Date(), city.timezone);
    const maxForecastDay = maxForecastDayKey(city.timezone);

    if (compareDayKeys(date, maxForecastDay) > 0) {
      return unavailableDay(city, date, 'out_of_range');
    }

    if (compareDayKeys(date, todayKey) < 0) {
      try {
        const archived = await ensureArchivedDayHours(city, date);
        return {
          provider: PROVIDER,
          cityId: city.id,
          cityName: city.name,
          cityTimezone: city.timezone,
          date,
          fetchedAt: archived.fetchedAt.toISOString(),
          stale: false,
          source: 'archive',
          available: archived.hours.length > 0,
          hours: archived.hours,
          attribution: 'Open-Meteo',
          ...(archived.hours.length > 0 ? {} : { unavailableReason: 'out_of_range' as const }),
        };
      } catch {
        return unavailableDay(city, date, 'out_of_range');
      }
    }

    const forecastDay = await getForecastDay(city.id, date);
    if (!forecastDay) {
      return unavailableDay(city, date, 'out_of_range');
    }

    return {
      provider: PROVIDER,
      cityId: city.id,
      cityName: city.name,
      cityTimezone: city.timezone,
      date,
      fetchedAt: forecastDay.fetchedAt.toISOString(),
      stale: forecastDay.stale,
      source: 'forecast',
      available: forecastDay.hours.length > 0,
      hours: forecastDay.hours,
      attribution: 'Open-Meteo',
      ...(forecastDay.hours.length > 0 ? {} : { unavailableReason: 'out_of_range' as const }),
    };
  }

  static async getSummaryAt(cityId: string, at: Date, options?: { fetchIfMissing?: boolean }): Promise<{
    point: WeatherHourlyPoint;
    fetchedAt: string;
    stale: boolean;
    source: 'forecast' | 'archive';
  } | null> {
    const fetchIfMissing = options?.fetchIfMissing ?? false;
    const city = await readCity(cityId);
    if (city.latitude == null || city.longitude == null) return null;

    const day = dateKeyInTimezone(at, city.timezone);
    const todayKey = dateKeyInTimezone(new Date(), city.timezone);

    if (compareDayKeys(day, todayKey) < 0) {
      const archived = await readArchivedDayFromDb(city, day);
      if (!archived) {
        if (!fetchIfMissing) return null;
        const dayData = await WeatherDayArchiveService.getDay(cityId, day);
        if (!dayData.available || dayData.hours.length === 0) return null;
        const point = summaryFromHours(dayData.hours, at);
        if (!point) return null;
        return {
          point,
          fetchedAt: dayData.fetchedAt,
          stale: dayData.stale,
          source: dayData.source,
        };
      }

      const point = summaryFromHours(archived.hours, at);
      if (!point) return null;
      return {
        point,
        fetchedAt: archived.fetchedAt.toISOString(),
        stale: false,
        source: 'archive',
      };
    }

    const dayData = await WeatherDayArchiveService.getDay(cityId, day);
    if (!dayData.available || dayData.hours.length === 0) return null;

    const point = summaryFromHours(dayData.hours, at);
    if (!point) return null;

    return {
      point,
      fetchedAt: dayData.fetchedAt,
      stale: dayData.stale,
      source: dayData.source,
    };
  }

  static async getSummariesFromDbForGames<T extends {
    id: string;
    cityId: string;
    startTime: Date | string;
    endTime: Date | string;
    timeIsSet: boolean;
  }>(games: T[]): Promise<Map<string, {
    point: WeatherHourlyPoint;
    fetchedAt: string;
    stale: boolean;
    source: 'forecast' | 'archive';
  } | null>> {
    const now = Date.now();
    const pastGames = games.filter((game) => game.timeIsSet && new Date(game.endTime).getTime() <= now);
    const result = new Map<string, {
      point: WeatherHourlyPoint;
      fetchedAt: string;
      stale: boolean;
      source: 'forecast' | 'archive';
    } | null>();

    if (pastGames.length === 0) return result;

    const cityIds = Array.from(new Set(pastGames.map((game) => game.cityId)));
    const cities = await prisma.city.findMany({
      where: { id: { in: cityIds } },
      select: { id: true, name: true, timezone: true, latitude: true, longitude: true },
    });
    const cityById = new Map(cities.map((city) => [city.id, city]));

    const dayKeysByCity = new Map<string, Set<string>>();
    for (const game of pastGames) {
      const city = cityById.get(game.cityId);
      if (!city) continue;
      const day = dateKeyInTimezone(new Date(game.startTime), city.timezone);
      const days = dayKeysByCity.get(game.cityId) ?? new Set<string>();
      days.add(day);
      dayKeysByCity.set(game.cityId, days);
    }

    const archiveRows = await prisma.weatherDayArchive.findMany({
      where: {
        provider: PROVIDER,
        OR: Array.from(dayKeysByCity.entries()).flatMap(([cityId, days]) => (
          Array.from(days).map((day) => ({ cityId, day }))
        )),
      },
    });

    const archiveByCityDay = new Map<string, typeof archiveRows[number]>();
    for (const row of archiveRows) {
      archiveByCityDay.set(`${row.cityId}:${row.day}`, row);
    }

    for (const game of pastGames) {
      const city = cityById.get(game.cityId);
      if (!city) {
        result.set(game.id, null);
        continue;
      }

      const day = dateKeyInTimezone(new Date(game.startTime), city.timezone);
      const row = archiveByCityDay.get(`${game.cityId}:${day}`);
      if (!row) {
        result.set(game.id, null);
        continue;
      }

      const hours = filterHourlyByDayKey(weatherHoursFromJson(row.hours), day, city.timezone);
      const point = summaryFromHours(hours, new Date(game.startTime));
      if (!point) {
        result.set(game.id, null);
        continue;
      }

      result.set(game.id, {
        point,
        fetchedAt: row.fetchedAt.toISOString(),
        stale: false,
        source: 'archive',
      });
    }

    return result;
  }
}
