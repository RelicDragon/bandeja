import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const querySrc = readFileSync(join(__dirname, 'availableGamesQuery.ts'), 'utf8');
const controllerSrc = readFileSync(
  join(__dirname, '../../controllers/game.controller.ts'),
  'utf8',
);
const protocolSrc = readFileSync(join(__dirname, 'availableGamesProtocol.ts'), 'utf8');

assert.match(querySrc, /enrich = false/);
assert.match(querySrc, /if \(enrich && games\.length > 0\)/);
assert.match(controllerSrc, /resolveAvailableEnrich\(req\.query\)/);
assert.match(controllerSrc, /enrichAvailableGames/);
assert.match(protocolSrc, /format=card/);
assert.match(protocolSrc, /return true/);

console.log('availableGamesEnrich.defer.test.ts: ok');
