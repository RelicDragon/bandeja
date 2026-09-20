import assert from 'node:assert/strict';
import {
  PLATFORM_SETTING_CACHE_TTL_MS,
  PLATFORM_SETTING_KEYS,
  PLATFORM_SETTING_KEY_PATTERN,
  PlatformSettingCache,
  parsePlatformSettingNumber,
} from './platformSetting.service';

// ---------------------------------------------------------------------------
// numeric parsing
// ---------------------------------------------------------------------------

assert.equal(parsePlatformSettingNumber('100'), 100);
assert.equal(parsePlatformSettingNumber(' 100 '), 100, 'stored values are trimmed');
assert.equal(parsePlatformSettingNumber('12.5'), 12.5);
assert.equal(parsePlatformSettingNumber('-3'), -3);
assert.equal(parsePlatformSettingNumber('0'), 0, '0 is a value, not a miss');

// An unset key with no fallback is `null` — this is exactly the state PRD 348
// reads as "coins settlement unavailable, hide the option".
assert.equal(parsePlatformSettingNumber(null), null);
assert.equal(parsePlatformSettingNumber(null, 50), 50);

// Malformed rows fall back instead of throwing.
assert.equal(parsePlatformSettingNumber('abc'), null);
assert.equal(parsePlatformSettingNumber('abc', 7), 7);
assert.equal(parsePlatformSettingNumber(''), null);
assert.equal(parsePlatformSettingNumber('   ', 7), 7);
assert.equal(parsePlatformSettingNumber('Infinity', 7), 7, 'Infinity is not a usable rate');
assert.equal(parsePlatformSettingNumber('NaN', 7), 7);

// ---------------------------------------------------------------------------
// TTL cache
// ---------------------------------------------------------------------------

assert.equal(PLATFORM_SETTING_CACHE_TTL_MS, 60_000);

let clock = 1_000;
const cache = new PlatformSettingCache(PLATFORM_SETTING_CACHE_TTL_MS, () => clock);

assert.equal(cache.get('A'), undefined, 'cold cache is a miss');

cache.set('A', '100');
assert.equal(cache.get('A'), '100');

// A missing row is cached as null so an unset key does not hit the DB every read.
cache.set(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT, null);
assert.equal(
  cache.get(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT),
  null,
  'null is a cached answer, not a miss',
);

clock += PLATFORM_SETTING_CACHE_TTL_MS - 1;
assert.equal(cache.get('A'), '100', 'still fresh one tick before the TTL');

clock += 1;
assert.equal(cache.get('A'), undefined, 'expired exactly at the TTL');
assert.equal(
  cache.get(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT),
  undefined,
  'cached nulls expire too',
);
assert.equal(cache.size, 0, 'expired entries are evicted on read');

cache.set('B', '1');
cache.set('C', '2');
cache.delete('B');
assert.equal(cache.get('B'), undefined);
assert.equal(cache.get('C'), '2');
cache.clear();
assert.equal(cache.get('C'), undefined);
assert.equal(cache.size, 0);

// A write must be visible immediately on the writing node.
cache.set('D', '1');
assert.equal(cache.get('D'), '1');
cache.set('D', '2');
assert.equal(cache.get('D'), '2', 'setSetting overwrites the cached value in place');

// ---------------------------------------------------------------------------
// key shape
// ---------------------------------------------------------------------------

for (const key of Object.values(PLATFORM_SETTING_KEYS)) {
  assert.match(key, PLATFORM_SETTING_KEY_PATTERN, `${key} must be admin-writable`);
}
assert.equal(PLATFORM_SETTING_KEY_PATTERN.test('lowercase'), false);
assert.equal(PLATFORM_SETTING_KEY_PATTERN.test('WITH SPACE'), false);
assert.equal(PLATFORM_SETTING_KEY_PATTERN.test('A'), false, 'single char is too short');
assert.equal(PLATFORM_SETTING_KEY_PATTERN.test('A'.repeat(65)), false, 'max 64 chars');

console.log('platformSetting.service.test.ts: ok');
