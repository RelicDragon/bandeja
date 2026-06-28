import assert from 'node:assert/strict';
import {
  conditionKeyForWeatherCode,
  fullDayWindow,
  hourlyWindow,
  type WeatherForecastPayload,
  type WeatherHourlyPoint,
} from './weatherForecast.service';

assert.equal(conditionKeyForWeatherCode(0), 'clear');
assert.equal(conditionKeyForWeatherCode(2), 'partly_cloudy');
assert.equal(conditionKeyForWeatherCode(3), 'cloudy');
assert.equal(conditionKeyForWeatherCode(45), 'fog');
assert.equal(conditionKeyForWeatherCode(53), 'drizzle');
assert.equal(conditionKeyForWeatherCode(63), 'rain');
assert.equal(conditionKeyForWeatherCode(67), 'freezing_rain');
assert.equal(conditionKeyForWeatherCode(75), 'snow');
assert.equal(conditionKeyForWeatherCode(81), 'showers');
assert.equal(conditionKeyForWeatherCode(95), 'thunderstorm');
assert.equal(conditionKeyForWeatherCode(777), 'unknown');

const HOUR_MS = 60 * 60 * 1000;

function hourlyTimes(start: string, count: number): string[] {
  const startTime = new Date(start).getTime();
  return Array.from({ length: count }, (_, index) => new Date(startTime + index * HOUR_MS).toISOString());
}

function point(time: string): WeatherHourlyPoint {
  return {
    time,
    temperatureC: 20,
    temperatureF: 68,
    weatherCode: 0,
    conditionKey: 'clear',
    precipitationProbability: null,
    precipitationMm: null,
    windSpeedKmh: null,
    relativeHumidity: null,
    isDay: true,
  };
}

function payload(times: string[]): WeatherForecastPayload {
  return {
    provider: 'open-meteo',
    cityId: 'city-1',
    cityName: 'Test City',
    cityTimezone: 'UTC',
    latitude: 45,
    longitude: 19,
    fetchedAt: '2026-06-28T00:00:00.000Z',
    forecastStart: times[0],
    forecastEnd: times[times.length - 1],
    hourly: times.map(point),
  };
}

assert.deepEqual(
  hourlyWindow(
    payload([
      '2026-06-28T07:00:00.000Z',
      '2026-06-28T08:00:00.000Z',
      '2026-06-28T09:00:00.000Z',
      '2026-06-28T10:00:00.000Z',
      '2026-06-28T11:00:00.000Z',
    ]),
    new Date('2026-06-28T08:00:00.000Z'),
    new Date('2026-06-28T10:00:00.000Z'),
  ).map((p) => p.time),
  [
    '2026-06-28T07:00:00.000Z',
    '2026-06-28T08:00:00.000Z',
    '2026-06-28T09:00:00.000Z',
    '2026-06-28T10:00:00.000Z',
  ],
);

assert.deepEqual(
  hourlyWindow(
    payload([
      '2026-06-30T23:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T01:00:00.000Z',
      '2026-07-01T02:00:00.000Z',
      '2026-07-01T03:00:00.000Z',
    ]),
    new Date('2026-07-01T00:00:00.000Z'),
    new Date('2026-07-01T02:00:00.000Z'),
  ).map((p) => p.time),
  [
    '2026-06-30T23:00:00.000Z',
    '2026-07-01T00:00:00.000Z',
    '2026-07-01T01:00:00.000Z',
    '2026-07-01T02:00:00.000Z',
  ],
);

assert.deepEqual(
  hourlyWindow(
    payload([
      '2026-07-01T22:00:00.000Z',
      '2026-07-01T23:00:00.000Z',
      '2026-07-02T00:00:00.000Z',
      '2026-07-02T01:00:00.000Z',
      '2026-07-02T02:00:00.000Z',
    ]),
    new Date('2026-07-01T23:00:00.000Z'),
    new Date('2026-07-02T01:00:00.000Z'),
  ).map((p) => p.time),
  [
    '2026-07-01T22:00:00.000Z',
    '2026-07-01T23:00:00.000Z',
    '2026-07-02T00:00:00.000Z',
    '2026-07-02T01:00:00.000Z',
  ],
);

assert.deepEqual(
  fullDayWindow(
    payload(hourlyTimes('2026-06-28T00:00:00.000Z', 26)),
    new Date('2026-06-28T08:00:00.000Z'),
    new Date('2026-06-28T10:00:00.000Z'),
  ).map((p) => p.time),
  hourlyTimes('2026-06-28T00:00:00.000Z', 24),
);

assert.deepEqual(
  fullDayWindow(
    payload(hourlyTimes('2026-06-30T23:00:00.000Z', 26)),
    new Date('2026-07-01T00:00:00.000Z'),
    new Date('2026-07-01T02:00:00.000Z'),
  ).map((p) => p.time),
  [
    '2026-06-30T23:00:00.000Z',
    ...hourlyTimes('2026-07-01T00:00:00.000Z', 24),
  ],
);

assert.deepEqual(
  fullDayWindow(
    payload(hourlyTimes('2026-07-01T00:00:00.000Z', 27)),
    new Date('2026-07-01T23:00:00.000Z'),
    new Date('2026-07-02T01:00:00.000Z'),
  ).map((p) => p.time),
  [
    ...hourlyTimes('2026-07-01T00:00:00.000Z', 24),
    '2026-07-02T00:00:00.000Z',
    '2026-07-02T01:00:00.000Z',
  ],
);

console.log('weatherForecast.service.test passed');
