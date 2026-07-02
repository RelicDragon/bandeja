import assert from 'node:assert/strict';
import { filterHourlyByDayKey, dateKeyInTimezone } from './weatherForecast.service';
import type { WeatherHourlyPoint } from './weatherForecast.service';

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

assert.deepEqual(
  filterHourlyByDayKey(
    [
      point('2026-06-15T21:00:00.000Z'),
      point('2026-06-15T22:00:00.000Z'),
      point('2026-06-15T23:00:00.000Z'),
      point('2026-06-16T00:00:00.000Z'),
    ],
    '2026-06-16',
    'Europe/Belgrade',
  ).map((row) => row.time),
  [
    '2026-06-15T21:00:00.000Z',
    '2026-06-15T22:00:00.000Z',
    '2026-06-15T23:00:00.000Z',
    '2026-06-16T00:00:00.000Z',
  ],
);

assert.equal(
  filterHourlyByDayKey(
    Array.from({ length: 24 }, (_, index) => point(`2026-06-15T${String(index).padStart(2, '0')}:00:00.000Z`)),
    '2026-06-15',
    'UTC',
  ).length,
  24,
);

assert.equal(dateKeyInTimezone(new Date('2026-06-15T22:30:00.000Z'), 'Europe/Belgrade'), '2026-06-16');

console.log('weatherDayArchive.service.test passed');
