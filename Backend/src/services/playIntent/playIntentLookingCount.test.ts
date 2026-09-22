import assert from 'node:assert/strict';
import {
  LOOKING_COUNT_CACHE_TTL_SECONDS,
  countLookingExcludingViewer,
  lookingCountCacheKey,
  parseCachedLookingUserIds,
} from './playIntentLookingCount';

// PRD 363 — pure pieces of the looking-to-play count.

assert.equal(LOOKING_COUNT_CACHE_TTL_SECONDS, 60, 'PRD 363: 60 s cache');

// ---------------------------------------------------------------------------
// cache key: one per (city, sport, window); window order does not matter
// ---------------------------------------------------------------------------

assert.equal(
  lookingCountCacheKey('city-1', 'PADEL', ['2026-09-22']),
  'pp:play-intents:looking-count:v1:city-1:PADEL:2026-09-22',
);
assert.equal(
  lookingCountCacheKey('city-1', 'PADEL', ['2026-09-23', '2026-09-22']),
  lookingCountCacheKey('city-1', 'PADEL', ['2026-09-22', '2026-09-23']),
  'day keys are normalised',
);
assert.notEqual(
  lookingCountCacheKey('city-1', 'PADEL', ['2026-09-22']),
  lookingCountCacheKey('city-1', 'PADEL', ['2026-09-22', '2026-09-23']),
  'the 18:00 rollover to a two-day window is a different key',
);
assert.notEqual(
  lookingCountCacheKey('city-1', 'PADEL', ['2026-09-22']),
  lookingCountCacheKey('city-1', 'TENNIS', ['2026-09-22']),
);

// ---------------------------------------------------------------------------
// viewer exclusion and distinctness
// ---------------------------------------------------------------------------

assert.equal(countLookingExcludingViewer(['a', 'b', 'c'], 'viewer'), 3);
assert.equal(countLookingExcludingViewer(['a', 'b', 'viewer'], 'viewer'), 2, 'the viewer is not "someone else"');
assert.equal(countLookingExcludingViewer(['a', 'a', 'b'], 'viewer'), 2, 'two intents, one person');
assert.equal(countLookingExcludingViewer([], 'viewer'), 0);
assert.equal(countLookingExcludingViewer(['viewer'], 'viewer'), 0);

// ---------------------------------------------------------------------------
// cached payload parsing is defensive
// ---------------------------------------------------------------------------

assert.deepEqual(parseCachedLookingUserIds('["a","b"]'), ['a', 'b']);
assert.deepEqual(parseCachedLookingUserIds('[]'), []);
assert.equal(parseCachedLookingUserIds(null), null);
assert.equal(parseCachedLookingUserIds(undefined), null);
assert.equal(parseCachedLookingUserIds(''), null);
assert.equal(parseCachedLookingUserIds('{"count":3}'), null, 'an object is not a list');
assert.equal(parseCachedLookingUserIds('[1,2]'), null, 'numbers are not ids');
assert.equal(parseCachedLookingUserIds('not json'), null);

console.log('playIntentLookingCount tests passed');
