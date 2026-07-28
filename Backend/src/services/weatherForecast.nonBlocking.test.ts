import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const weatherSrc = readFileSync(join(__dirname, 'weatherForecast.service.ts'), 'utf8');
const enrichSrc = readFileSync(join(__dirname, 'game/availableGamesEnrichment.ts'), 'utf8');
const schedulerSrc = readFileSync(join(__dirname, 'weatherForecastScheduler.service.ts'), 'utf8');
const serverSrc = readFileSync(join(__dirname, '../server.ts'), 'utf8');

assert.match(enrichSrc, /refresh:\s*'background'/);
assert.match(enrichSrc, /FIND_WEATHER_SOFT_WAIT_MS/);
assert.match(weatherSrc, /BACKGROUND_REFRESH_CONCURRENCY\s*=\s*2/);
assert.match(weatherSrc, /BACKGROUND_REFRESH_KICK_BUDGET\s*=\s*20/);
assert.match(weatherSrc, /FIND_WEATHER_SOFT_WAIT_MS\s*=\s*750/);
assert.match(weatherSrc, /BLOCKING_SOFT_WAIT_MS\s*=\s*3000/);
assert.match(weatherSrc, /function kickCityRefresh/);
assert.match(weatherSrc, /function getCachesForCitiesNonBlocking/);
assert.match(weatherSrc, /awaitCityRefreshSoft/);
assert.match(weatherSrc, /waitingCities\.slice\(0,\s*BACKGROUND_REFRESH_CONCURRENCY\)/);
assert.match(weatherSrc, /prisma\.game\.groupBy/);
assert.match(weatherSrc, /softWaitMs\?:/);
assert.equal(weatherSrc.includes('BACKGROUND_SOFT_WAIT_MS'), false);
assert.match(schedulerSrc, /prewarmUpcomingGameCities/);
assert.match(schedulerSrc, /\*\/30 \* \* \* \*/);
assert.match(serverSrc, /WeatherForecastScheduler/);
assert.match(serverSrc, /weatherForecastScheduler\.start\(\)/);
assert.match(serverSrc, /weatherForecastScheduler\.stop\(\)/);

console.log('weatherForecast.nonBlocking.test.ts: ok');
