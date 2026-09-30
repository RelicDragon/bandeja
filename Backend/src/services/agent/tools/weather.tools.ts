/**
 * `get_weather` (slice 9d, docs/plans/ai-agent.md §16.4). Read-only, reuses the app's weather
 * services and their fetch + DB cache — no outbound call of its own:
 *   - `{gameId}` → agent visibility first (hidden = missing), then
 *     `WeatherForecastService.getWindowForGame` (what `GET /games/:id/weather` runs).
 *   - `{cityId?, date}` → `WeatherDayArchiveService.getDay` (what `GET /weather/day` runs:
 *     forecast up to 10 days ahead, archive for past days). Default city = home city.
 * Output is compact: local `HH:mm` hours in the game's / city's timezone, °C, km/h, %, mm
 * (the app's units for all 11 locales).
 */
import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod/v4';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { WeatherDayArchiveService } from '../../weatherDayArchive.service';
import {
  WeatherForecastService,
  dateKeyInTimezone,
  type WeatherHourlyPoint,
} from '../../weatherForecast.service';
import { classifyWeatherRisk, detectOutdoor } from '../../weather/weatherRisk';
import { assertAgentCanViewGame } from '../access/agentGameAccess';
import { agentWeatherT } from '../i18n/agentWeatherI18n';
import { defineTool } from './registry';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type UnavailableReason = 'missing_city_coordinates' | 'out_of_range' | 'not_scheduled';

const UNAVAILABLE_NOTES: Record<UnavailableReason, string> = {
  not_scheduled: 'The game has no fixed time yet, so there is no forecast for it.',
  out_of_range: 'No forecast is available for this date yet (forecasts cover about the next 10 days). Say so; do not guess the weather.',
  missing_city_coordinates: 'Weather is not available for this city. Say so; do not guess the weather.',
};

type CompactHour = {
  time: string;
  tempC: number;
  condition: string;
  rainChancePct?: number;
  rainMm?: number;
  windKmh?: number;
};

function compactHour(point: WeatherHourlyPoint, timezone: string): CompactHour {
  return {
    time: formatInTimeZone(new Date(point.time), timezone, 'HH:mm'),
    tempC: Math.round(point.temperatureC),
    condition: point.conditionKey,
    ...(point.precipitationProbability != null ? { rainChancePct: point.precipitationProbability } : {}),
    ...(point.precipitationMm != null ? { rainMm: point.precipitationMm } : {}),
    ...(point.windSpeedKmh != null ? { windKmh: Math.round(point.windSpeedKmh) } : {}),
  };
}

function maxOf(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => typeof value === 'number');
  return numbers.length ? Math.max(...numbers) : null;
}

function overview(hours: WeatherHourlyPoint[]) {
  if (hours.length === 0) return null;
  const temps = hours.map((hour) => hour.temperatureC);
  return {
    minTempC: Math.round(Math.min(...temps)),
    maxTempC: Math.round(Math.max(...temps)),
    maxRainChancePct: maxOf(hours.map((hour) => hour.precipitationProbability)),
    maxRainMm: maxOf(hours.map((hour) => hour.precipitationMm)),
    maxWindKmh: maxOf(hours.map((hour) => (hour.windSpeedKmh == null ? null : Math.round(hour.windSpeedKmh)))),
  };
}

const UNITS = { temperature: '°C', wind: 'km/h', rainChance: '%', rain: 'mm per hour' } as const;

export const getWeatherTool = defineTool({
  name: 'get_weather',
  description:
    'Weather forecast (hourly temperature, rain chance, rain, wind) for one game ({gameId}) around its start time, ' +
    'or for a whole day in a city ({date}, optional cityId; default the home city). Past dates return recorded weather. ' +
    'Use it when the user plans or discusses an outdoor game, asks whether to play or reschedule, or asks about the weather.',
  kind: 'read',
  scope: 'user',
  input: z.object({
    gameId: z.string().min(1).max(64).optional().describe('Game id from another tool; do not combine with cityId/date'),
    cityId: z.string().min(1).max(64).optional().describe('City id from list_cities; only with date; defaults to the home city'),
    date: z.string().regex(DATE_PATTERN, 'date must be YYYY-MM-DD').optional().describe('Local calendar date YYYY-MM-DD in the city'),
  }).strict().superRefine((args, issues) => {
    if (args.gameId && (args.cityId || args.date)) {
      issues.addIssue({ code: 'custom', message: 'Pass either gameId, or date with an optional cityId, not both' });
    } else if (!args.gameId && !args.date) {
      issues.addIssue({ code: 'custom', message: 'Pass gameId, or date (YYYY-MM-DD) with an optional cityId' });
    }
  }),
  label: (_args, locale) => agentWeatherT(locale, 'label.getWeather'),
  handler: async (ctx, args) => {
    if (args.gameId) {
      const { principal } = ctx;
      await assertAgentCanViewGame(principal, args.gameId);
      const game = await prisma.game.findUnique({
        where: { id: args.gameId },
        select: {
          id: true,
          name: true,
          startTime: true,
          endTime: true,
          timeIsSet: true,
          city: { select: { name: true, timezone: true } },
          club: { select: { name: true, courts: { where: { isActive: true }, select: { isIndoor: true } } } },
          court: { select: { isIndoor: true } },
          gameCourts: { select: { court: { select: { isIndoor: true } } } },
        },
      });
      if (!game) throw new ApiError(404, 'Game not found');
      const window = await WeatherForecastService.getWindowForGame(game.id, 'game');
      const timezone = game.city.timezone || 'UTC';
      const date = game.timeIsSet ? dateKeyInTimezone(game.startTime, timezone) : null;
      const outdoor = detectOutdoor({
        gameCourts: game.gameCourts.map((row) => row.court),
        primaryCourt: game.court,
        clubActiveCourts: game.club?.courts ?? [],
      });
      const unavailableReason = window.available ? undefined : (window.unavailableReason ?? 'out_of_range');
      const hours = window.available ? window.hours : [];
      return {
        data: {
          gameId: game.id,
          gameName: game.name,
          club: game.club?.name ?? null,
          city: game.city.name,
          timezone,
          date,
          start: game.timeIsSet ? formatInTimeZone(game.startTime, timezone, 'HH:mm') : null,
          end: game.timeIsSet ? formatInTimeZone(game.endTime, timezone, 'HH:mm') : null,
          // null = unknown (no courts to judge by): don't claim indoor or outdoor.
          outdoor: outdoor.known ? outdoor.outdoor : null,
          source: window.source,
          available: window.available,
          ...(unavailableReason ? { unavailableReason, note: UNAVAILABLE_NOTES[unavailableReason] } : {}),
          ...(window.available
            ? {
                ...(window.stale ? { stale: true } : {}),
                units: UNITS,
                overview: overview(hours),
                risk: classifyWeatherRisk(hours).severity,
                hours: hours.map((hour) => compactHour(hour, timezone)),
              }
            : {}),
        },
        summary: window.available
          ? agentWeatherT(ctx.locale, 'summary.weather', { city: game.city.name, date: date ?? '' })
          : agentWeatherT(ctx.locale, 'summary.unavailable', { date: date ?? game.name ?? '—' }),
      };
    }

    const cityId = args.cityId ?? ctx.principal.currentCityId;
    if (!cityId) {
      throw new ApiError(400, 'No home city set; pass cityId (see list_cities)');
    }
    const date = args.date as string;
    const day = await WeatherDayArchiveService.getDay(cityId, date);
    const timezone = day.cityTimezone || 'UTC';
    const unavailableReason = day.available ? undefined : (day.unavailableReason ?? 'out_of_range');
    return {
      data: {
        cityId: day.cityId,
        city: day.cityName,
        timezone,
        date,
        source: day.source,
        available: day.available,
        ...(unavailableReason ? { unavailableReason, note: UNAVAILABLE_NOTES[unavailableReason] } : {}),
        ...(day.available
          ? {
              ...(day.stale ? { stale: true } : {}),
              units: UNITS,
              overview: overview(day.hours),
              hours: day.hours.map((hour) => compactHour(hour, timezone)),
            }
          : {}),
      },
      summary: day.available
        ? agentWeatherT(ctx.locale, 'summary.weather', { city: day.cityName, date })
        : agentWeatherT(ctx.locale, 'summary.unavailable', { date }),
    };
  },
});

export const WEATHER_TOOLS = [getWeatherTool];
