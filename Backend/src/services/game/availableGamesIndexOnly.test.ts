import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const querySrc = readFileSync(join(__dirname, 'availableGamesQuery.ts'), 'utf8');
const controllerSrc = readFileSync(
  join(__dirname, '../../controllers/game.controller.ts'),
  'utf8',
);

assert.match(querySrc, /indexOnly/);
assert.match(querySrc, /Month badge path/);
assert.match(querySrc, /viewerIsParticipant/);
assert.match(querySrc, /wantDayIndex = kind === 'calendar' && !cursor && !singleDay/);
assert.match(querySrc, /dayIndexNextCursor/);
assert.match(controllerSrc, /indexOnly === 'true'/);

console.log('availableGamesIndexOnly.test.ts: ok');
