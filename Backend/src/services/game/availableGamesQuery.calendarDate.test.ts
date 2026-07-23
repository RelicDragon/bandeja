import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const querySrc = readFileSync(join(__dirname, 'availableGamesQuery.ts'), 'utf8');
const boundsSrc = readFileSync(join(__dirname, 'calendarDateBounds.ts'), 'utf8');

assert.match(querySrc, /where\.AND = \[\{ startTime: startTimeRange \}\]/);
assert.doesNotMatch(
  querySrc,
  /OR: \[\{ entityType: 'LEAGUE_SEASON' \}, \{ startTime: startTimeRange \}\]/,
);
assert.match(querySrc, /\{ entityType: 'LEAGUE_SEASON' \}/);
assert.match(querySrc, /calendarDateBounds\(/);
assert.doesNotMatch(querySrc, /start\.setHours\(0,\s*0,\s*0,\s*0\)/);
assert.match(boundsSrc, /fromZonedTime/);

console.log('availableGamesQuery.calendarDate.test.ts: ok');
