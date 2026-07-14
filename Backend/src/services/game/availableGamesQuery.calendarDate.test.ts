import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const querySrc = readFileSync(join(__dirname, 'availableGamesQuery.ts'), 'utf8');

assert.match(querySrc, /where\.AND = \[\{ startTime: startTimeRange \}\]/);
assert.doesNotMatch(
  querySrc,
  /OR: \[\{ entityType: 'LEAGUE_SEASON' \}, \{ startTime: startTimeRange \}\]/,
);
assert.match(querySrc, /\{ entityType: 'LEAGUE_SEASON' \}/);
assert.match(querySrc, /startTime: \{ gte: today, lte: horizon \}/);

console.log('availableGamesQuery.calendarDate.test.ts: ok');
