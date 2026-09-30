/**
 * Slice 9d `get_weather` (real dev DB, no LLM, no real outbound call):
 *   - actor × game view matrix: the agent visibility of `get_game` (hidden = the same
 *     `not_found` as a missing id);
 *   - game forecast around the start time (local HH:mm in the city timezone, °C, km/h, risk,
 *     outdoor from the courts) via `WeatherForecastService.getWindowForGame`;
 *   - day forecast for a city (explicit and home-city default) via `WeatherDayArchiveService.getDay`,
 *     served from the DB cache on the second call;
 *   - past date → archive (one archive fetch, then the DB row);
 *   - beyond the forecast horizon / unscheduled game / city without coordinates → "not available"
 *     with a note, no fetch;
 *   - unknown city → not_found, no home city → bad_request; strict input.
 * Open-Meteo is faked by replacing `globalThis.fetch`; any other URL fails the test.
 */
import assert from 'node:assert/strict';
import { EntityType, GameType, ParticipantRole, ParticipantStatus, Sport } from '@prisma/client';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import {
  assertMatrixReport,
  createAgentPermissionFixture,
  matrixRow,
  runAgentPermissionMatrix,
  type AgentMatrixExpectations,
  type AgentPermissionFixture,
} from '../access/__tests__/agentPermissionMatrix';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { getAgentToolRegistry } from '../tools';
import type { AgentToolExecution } from '../tools/registry';

const TZ = 'Europe/Belgrade';
const DAY_MS = 24 * 60 * 60 * 1000;

// --- fake Open-Meteo --------------------------------------------------------------------------
const calls = { forecast: 0, archive: 0, other: [] as string[] };
const realFetch = globalThis.fetch;

function forecastBody(): unknown {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const time: string[] = [];
  const temperature: number[] = [];
  const code: number[] = [];
  const pop: number[] = [];
  const precipitation: number[] = [];
  const wind: number[] = [];
  for (let i = 0; i < 240; i += 1) {
    const at = new Date(start.getTime() + i * 60 * 60 * 1000);
    time.push(at.toISOString().slice(0, 16));
    const localHour = Number(formatInTimeZone(at, TZ, 'H'));
    temperature.push(10 + localHour * 0.5);
    // Rain in the evening (local 18:00–20:00): drives the game-window risk.
    const evening = localHour >= 18 && localHour <= 20;
    code.push(evening ? 63 : 1);
    pop.push(evening ? 70 : 10);
    precipitation.push(evening ? 0.6 : 0);
    wind.push(12.4);
  }
  return {
    hourly: {
      time,
      temperature_2m: temperature,
      weather_code: code,
      precipitation_probability: pop,
      precipitation,
      wind_speed_10m: wind,
      relative_humidity_2m: time.map(() => 60),
      is_day: time.map(() => 1),
    },
  };
}

function archiveBody(day: string): unknown {
  const time = Array.from({ length: 24 }, (_, h) => `${day}T${String(h).padStart(2, '0')}:00`);
  return {
    hourly: {
      time,
      temperature_2m: time.map(() => 15),
      weather_code: time.map(() => 3),
      precipitation: time.map(() => 0.2),
      wind_speed_10m: time.map(() => 20),
      relative_humidity_2m: time.map(() => 70),
      is_day: time.map(() => 1),
    },
  };
}

globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === 'api.open-meteo.com' && url.pathname === '/v1/forecast') {
    calls.forecast += 1;
    return new Response(JSON.stringify(forecastBody()), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.hostname === 'archive-api.open-meteo.com') {
    calls.archive += 1;
    return new Response(JSON.stringify(archiveBody(url.searchParams.get('start_date') ?? '')), { status: 200 });
  }
  calls.other.push(url.toString());
  throw new Error(`unexpected outbound call in test: ${url.toString()}`);
}) as typeof fetch;

// --- helpers ------------------------------------------------------------------------------------
const registry = getAgentToolRegistry();

async function exec(principal: AgentPrincipal, args: unknown, locale = 'en'): Promise<AgentToolExecution> {
  return registry.executeTool({ principal, locale, timezone: TZ, now: new Date() }, 'get_weather', args);
}

/** Maps a tool result to the matrix outcomes (`classifyAgentOutcome` reads ApiErrors). */
async function callWeather(principal: AgentPrincipal, args: unknown): Promise<AgentToolExecution> {
  const result = await exec(principal, args);
  if (!result.ok) {
    const error = (result.data as { error: string }).error;
    if (error === 'not_found') throw new ApiError(404, 'not found');
    if (error === 'forbidden') throw new ApiError(403, 'forbidden');
    if (error === 'bad_request' || error === 'invalid_arguments') throw new ApiError(400, 'bad request');
    throw new Error(`get_weather failed: ${JSON.stringify(result.data)}`);
  }
  return result;
}

const VIEW: AgentMatrixExpectations = {
  public: /*          */ matrixRow('A A A A A A A A'),
  private: /*         */ matrixRow('N A A A A A N A'),
  archived: /*        */ matrixRow('A A A A A A A A'),
  resultsLocked: /*   */ matrixRow('A A A A A A A A'),
  pendingEvent: /*    */ matrixRow('N N N N N A N A'),
  privateSeason: /*   */ matrixRow('A A A A A A A A'),
  leagueFixture: /*   */ matrixRow('A A A A A A A A'),
};

type DayData = {
  available: boolean;
  source: string;
  timezone: string;
  date: string;
  unavailableReason?: string;
  note?: string;
  units?: Record<string, string>;
  overview?: { minTempC: number; maxTempC: number; maxRainChancePct: number | null; maxWindKmh: number | null };
  hours?: { time: string; tempC: number; condition: string; rainChancePct?: number; rainMm?: number; windKmh?: number }[];
  risk?: string;
  outdoor?: boolean | null;
  start?: string | null;
};

function localDay(offsetDays: number): string {
  return formatInTimeZone(new Date(Date.now() + offsetDays * DAY_MS), TZ, 'yyyy-MM-dd');
}

(async () => {
  let exitCode = 0;
  let fixture: AgentPermissionFixture | null = null;
  const gameIds: string[] = [];
  let clubId: string | null = null;
  let cityId: string | null = null;
  try {
    fixture = await createAgentPermissionFixture();
    const principals = fixture.principals;

    // 1. Visibility: hidden games are the same not_found as a missing id. The fixture city has no
    //    coordinates, so every allowed cell answers "not available" without any fetch.
    assertMatrixReport(await runAgentPermissionMatrix({
      label: 'get_weather {gameId}',
      fixture,
      expectations: VIEW,
      run: (principal, gameId) => callWeather(principal, { gameId }),
    }));
    const hidden = await exec(principals.stranger, { gameId: fixture.games.private });
    const missing = await exec(principals.stranger, { gameId: 'does-not-exist' });
    assert.equal(hidden.ok, false);
    assert.deepEqual(hidden.data, missing.data, 'hidden game = missing game');
    assert.equal(hidden.summary, missing.summary);
    const noCoords = (await callWeather(principals.owner, { gameId: fixture.games.public })).data as DayData;
    assert.equal(noCoords.available, false);
    assert.equal(noCoords.unavailableReason, 'missing_city_coordinates');
    assert.ok(noCoords.note);
    assert.equal(noCoords.hours, undefined);
    assert.equal(calls.forecast + calls.archive, 0, 'no fetch for a city without coordinates');

    // Weather city with coordinates + a public outdoor game tomorrow 18:00–19:30 local.
    const suffix = fixture.suffix;
    const city = await prisma.city.create({
      data: { name: `Agent weather ${suffix}`, country: 'Test', timezone: TZ, latitude: 44.8, longitude: 20.46 },
    });
    cityId = city.id;
    const club = await prisma.club.create({
      data: {
        name: `Agent weather club ${suffix}`,
        normalizedName: `agent weather club ${suffix}`,
        address: 'Test street 1',
        cityId: city.id,
        courts: { create: [{ name: 'Court 1', isIndoor: false }] },
      },
      include: { courts: true },
    });
    clubId = club.id;
    const tomorrow = localDay(1);
    const start = fromZonedTime(`${tomorrow}T18:00:00`, TZ);
    const game = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        clubId: club.id,
        courtId: club.courts[0].id,
        startTime: start,
        endTime: new Date(start.getTime() + 90 * 60 * 1000),
        timeIsSet: true,
        isPublic: true,
        participants: {
          create: [{ userId: principals.owner.userId, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING }],
        },
      },
    });
    gameIds.push(game.id);
    const unscheduled = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime: start,
        endTime: new Date(start.getTime() + 90 * 60 * 1000),
        timeIsSet: false,
        isPublic: true,
      },
    });
    gameIds.push(unscheduled.id);

    // 2. Game forecast around the start time.
    const gameResult = await callWeather(principals.stranger, { gameId: game.id });
    const gameData = gameResult.data as DayData;
    assert.equal(gameData.available, true);
    assert.equal(gameData.source, 'forecast');
    assert.equal(gameData.timezone, TZ);
    assert.equal(gameData.date, tomorrow);
    assert.equal(gameData.start, '18:00');
    assert.equal(gameData.outdoor, true);
    assert.deepEqual(gameData.hours?.map((h) => h.time), ['17:00', '18:00', '19:00', '20:00']);
    assert.equal(gameData.hours?.[1].rainChancePct, 70);
    assert.equal(gameData.hours?.[1].windKmh, 12);
    assert.equal(gameData.hours?.[1].tempC, 19);
    assert.equal(gameData.hours?.[1].condition, 'rain');
    assert.equal(gameData.risk, 'likely');
    assert.equal(gameData.units?.temperature, '°C');
    assert.equal(gameData.units?.wind, 'km/h');
    assert.equal(calls.forecast, 1, 'one forecast fetch for the city');
    assert.equal(gameResult.summary, `Weather in ${city.name}, ${tomorrow}`);
    const ruSummary = (await exec(principals.stranger, { gameId: game.id }, 'ru')).summary;
    assert.equal(ruSummary, `Погода: ${city.name}, ${tomorrow}`);

    const notScheduled = (await callWeather(principals.stranger, { gameId: unscheduled.id })).data as DayData;
    assert.equal(notScheduled.available, false);
    assert.equal(notScheduled.unavailableReason, 'not_scheduled');

    // 3. Day forecast (explicit city, then the home-city default): served from the DB cache.
    const day = (await callWeather(principals.stranger, { cityId: city.id, date: tomorrow })).data as DayData;
    assert.equal(day.available, true);
    assert.equal(day.source, 'forecast');
    assert.equal(day.hours?.length, 24);
    assert.equal(day.hours?.[0].time, '00:00');
    assert.equal(day.overview?.maxRainChancePct, 70);
    const homePrincipal: AgentPrincipal = { ...principals.stranger, currentCityId: city.id };
    const homeDay = (await callWeather(homePrincipal, { date: tomorrow })).data as DayData & { cityId: string };
    assert.equal(homeDay.cityId, city.id);
    assert.deepEqual(homeDay.hours, day.hours);
    assert.equal(calls.forecast, 1, 'day reads reuse the cached forecast');

    // 4. Past date → archive (fetched once, then read from the DB).
    const past = localDay(-3);
    const archived = (await callWeather(homePrincipal, { date: past })).data as DayData;
    assert.equal(archived.available, true);
    assert.equal(archived.source, 'archive');
    assert.equal(archived.hours?.length, 24);
    assert.equal(archived.hours?.[0].rainChancePct, undefined, 'the archive has no rain probability');
    assert.equal(archived.hours?.[0].rainMm, 0.2);
    assert.equal(calls.archive, 1);
    await callWeather(homePrincipal, { date: past });
    assert.equal(calls.archive, 1, 'archived day is served from the DB');

    // 5. Beyond the forecast horizon → not available, no fetch.
    const far = localDay(30);
    const farResult = await callWeather(homePrincipal, { date: far });
    const farData = farResult.data as DayData;
    assert.equal(farData.available, false);
    assert.equal(farData.unavailableReason, 'out_of_range');
    assert.match(farData.note ?? '', /No forecast is available/);
    assert.equal(farResult.summary, `No forecast for ${far} yet`);

    // 6. Unknown city / no home city.
    const unknown = await exec(principals.stranger, { cityId: 'no-such-city', date: tomorrow });
    assert.equal(unknown.ok, false);
    assert.deepEqual(unknown.data, { error: 'not_found' });
    const noHome = await exec({ ...principals.stranger, currentCityId: null }, { date: tomorrow });
    assert.equal(noHome.ok, false);
    assert.equal((noHome.data as { error: string }).error, 'bad_request');

    // 7. Strict input.
    for (const args of [
      {},
      { cityId: city.id },
      { gameId: game.id, date: tomorrow },
      { gameId: game.id, cityId: city.id },
      { date: '2026/10/01' },
      { date: tomorrow, userId: principals.owner.userId },
      { gameId: game.id, units: 'F' },
    ]) {
      const result = await exec(principals.owner, args);
      assert.equal(result.ok, false, `rejects ${JSON.stringify(args)}`);
      assert.equal((result.data as { error: string }).error, 'invalid_arguments', `invalid ${JSON.stringify(args)}`);
    }

    assert.deepEqual(calls.other, [], 'no outbound call other than the faked Open-Meteo');
    console.log('agentWeather.integration.test.ts: ok');
  } catch (error) {
    exitCode = 1;
    console.error(error);
  } finally {
    globalThis.fetch = realFetch;
    await prisma.game.deleteMany({ where: { id: { in: gameIds } } }).catch((error) => console.error(error));
    if (clubId) await prisma.club.deleteMany({ where: { id: clubId } }).catch((error) => console.error(error));
    if (cityId) await prisma.city.deleteMany({ where: { id: cityId } }).catch((error) => console.error(error));
    if (fixture) await fixture.cleanup().catch((error) => console.error('fixture cleanup failed', error));
    await prisma.$disconnect();
    process.exit(exitCode);
  }
})();
