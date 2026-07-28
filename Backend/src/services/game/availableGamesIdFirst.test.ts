import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const querySrc = readFileSync(join(__dirname, 'availableGamesQuery.ts'), 'utf8');
const projectionSrc = readFileSync(join(__dirname, 'availableGamesCard.projection.ts'), 'utf8');
const slotsSrc = readFileSync(join(__dirname, 'availableGamesSlotsSql.ts'), 'utf8');
const weatherSrc = readFileSync(join(__dirname, '../weatherForecast.service.ts'), 'utf8');
const enrichSrc = readFileSync(join(__dirname, 'availableGamesEnrichment.ts'), 'utf8');

assert.match(projectionSrc, /FIND_CARD_GAME_SELECT/);
assert.match(projectionSrc, /getAvailableGamesCardSelect/);
assert.match(querySrc, /fetchSlimIdPage/);
assert.match(querySrc, /hydrateAvailableGameCards/);
assert.match(querySrc, /getAvailableGamesCardSelect/);
assert.match(querySrc, /filterOrderedRowsByAvailableSlots/);
assert.doesNotMatch(querySrc, /include:\s*getAvailableGamesCardInclude/);
assert.match(querySrc, /resultsStatus === 'FINAL'/);
assert.match(slotsSrc, /GROUP BY p\."gameId"/);
assert.match(slotsSrc, /filterOrderedRowsByAvailableSlots/);
assert.match(slotsSrc, /new Set\(/);

assert.match(weatherSrc, /FIND_WEATHER_SOFT_WAIT_MS/);
assert.match(weatherSrc, /BLOCKING_SOFT_WAIT_MS/);
assert.match(weatherSrc, /awaitCityRefreshSoft/);
assert.match(querySrc, /missingTrainerKeys|trainerByGame/);
assert.match(enrichSrc, /FIND_WEATHER_SOFT_WAIT_MS/);

console.log('availableGamesIdFirst.test.ts: ok');
