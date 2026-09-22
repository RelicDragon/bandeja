import assert from 'node:assert/strict';
import { parsePlatformSettingBoolean } from './platformSetting.service';
import {
  PUBLIC_PLATFORM_FLAGS_MAX_AGE_SECONDS,
  PUBLIC_PLATFORM_FLAG_KEYS,
  resolvePublicPlatformFlags,
} from './platformFlags.service';

// ---------------------------------------------------------------------------
// boolean parsing — a kill switch fails closed
// ---------------------------------------------------------------------------

assert.equal(parsePlatformSettingBoolean('true'), true);
assert.equal(parsePlatformSettingBoolean(' TRUE '), true, 'trimmed and case-insensitive');
assert.equal(parsePlatformSettingBoolean('1'), true);
assert.equal(parsePlatformSettingBoolean('on'), true);
assert.equal(parsePlatformSettingBoolean('yes'), true);

assert.equal(parsePlatformSettingBoolean(null), false, 'no row is off');
assert.equal(parsePlatformSettingBoolean(''), false, 'empty is off');
assert.equal(parsePlatformSettingBoolean('false'), false);
assert.equal(parsePlatformSettingBoolean('0'), false);
assert.equal(parsePlatformSettingBoolean('enabled'), false, 'unknown words are off, never on');

// ---------------------------------------------------------------------------
// the public projection is a closed allow-list
// ---------------------------------------------------------------------------

assert.deepEqual(
  [...PUBLIC_PLATFORM_FLAG_KEYS].sort(),
  ['FIND_LOOKING_COUNT_ENABLED', 'GAME_ORGANIZER_NEXT_ACTIONS_ENABLED'],
  'exactly the PRD 363 + PRD 364 keys; anything else needs a deliberate addition here'
);

assert.equal(PUBLIC_PLATFORM_FLAGS_MAX_AGE_SECONDS, 300, 'PRD 363: 5-minute cache header');

void (async () => {
  const table = new Map<string, string>([
    ['GAME_ORGANIZER_NEXT_ACTIONS_ENABLED', 'true'],
    ['COINS_PER_CURRENCY_UNIT', '100'],
    ['REFERRAL_REWARD_REFERRER', '50'],
  ]);
  const asked: string[] = [];
  const read = async (key: string) => {
    asked.push(key);
    return table.get(key) ?? null;
  };

  const flags = await resolvePublicPlatformFlags(read);

  assert.deepEqual(flags, {
    GAME_ORGANIZER_NEXT_ACTIONS_ENABLED: true,
    FIND_LOOKING_COUNT_ENABLED: false,
  });
  assert.ok(
    !('COINS_PER_CURRENCY_UNIT' in flags) && !('REFERRAL_REWARD_REFERRER' in flags),
    'non-allow-listed rows never leak'
  );
  assert.deepEqual(
    [...asked].sort(),
    [...PUBLIC_PLATFORM_FLAG_KEYS].sort(),
    'only the allow-listed keys are even read'
  );

  // A failing read switches that one flag off instead of failing the request.
  const flaky = await resolvePublicPlatformFlags(async (key) => {
    if (key === 'GAME_ORGANIZER_NEXT_ACTIONS_ENABLED') throw new Error('db down');
    return 'true';
  });
  assert.deepEqual(flaky, {
    GAME_ORGANIZER_NEXT_ACTIONS_ENABLED: false,
    FIND_LOOKING_COUNT_ENABLED: true,
  });

  console.log('platformFlags.service.test.ts passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
