import assert from 'node:assert/strict';
import { AVAILABLE_GAMES_DAY_INDEX_CAP } from './availableGamesQuery';
import { AVAILABLE_GAMES_MAX_TAKE, AVAILABLE_GAMES_MONTH_TAKE } from './availableGamesBounds';

assert.equal(AVAILABLE_GAMES_MONTH_TAKE, 300);
assert.equal(AVAILABLE_GAMES_MAX_TAKE, 300);
assert.ok(AVAILABLE_GAMES_DAY_INDEX_CAP >= AVAILABLE_GAMES_MONTH_TAKE);

console.log('availableGamesDayIndex.cap.test.ts: ok');
