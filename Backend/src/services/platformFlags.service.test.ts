import assert from 'node:assert/strict';
import { parsePlatformSettingBoolean } from './platformSetting.service';
import {
  PUBLIC_PLATFORM_FLAG_DEFAULTS,
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

assert.deepEqual(
  PUBLIC_PLATFORM_FLAG_DEFAULTS,
  { GAME_ORGANIZER_NEXT_ACTIONS_ENABLED: true, FIND_LOOKING_COUNT_ENABLED: true },
  'PRD 364 and PRD 363 both ship on; the admin row is the kill switch'
);

void (async () => {
  // No rows at all → every flag at its shipped default.
  assert.deepEqual(await resolvePublicPlatformFlags(async () => null), {
    GAME_ORGANIZER_NEXT_ACTIONS_ENABLED: true,
    FIND_LOOKING_COUNT_ENABLED: true,
  });

  // The admin row is the kill switch: an explicit 'false' turns a default-on flag off.
  assert.deepEqual(
    await resolvePublicPlatformFlags(async (key) =>
      key === 'GAME_ORGANIZER_NEXT_ACTIONS_ENABLED' ? 'false' : null
    ),
    { GAME_ORGANIZER_NEXT_ACTIONS_ENABLED: false, FIND_LOOKING_COUNT_ENABLED: true }
  );
  assert.equal(
    (await resolvePublicPlatformFlags(async (key) =>
      key === 'FIND_LOOKING_COUNT_ENABLED' ? 'false' : null
    ))['FIND_LOOKING_COUNT_ENABLED'],
    false,
    'PRD 363: an explicit false row switches the default-on count off'
  );
  assert.equal(
    (await resolvePublicPlatformFlags(async () => ''))['GAME_ORGANIZER_NEXT_ACTIONS_ENABLED'],
    false,
    'an empty row is an explicit off, not "unset"'
  );

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
    FIND_LOOKING_COUNT_ENABLED: true,
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

  // A failing read leaves that one flag at its default instead of failing the request.
  const flaky = await resolvePublicPlatformFlags(async (key) => {
    if (key === 'FIND_LOOKING_COUNT_ENABLED') throw new Error('db down');
    return 'false';
  });
  assert.deepEqual(flaky, {
    GAME_ORGANIZER_NEXT_ACTIONS_ENABLED: false,
    FIND_LOOKING_COUNT_ENABLED: true,
  });
  const flakyOn = await resolvePublicPlatformFlags(async () => {
    throw new Error('db down');
  });
  assert.equal(flakyOn.GAME_ORGANIZER_NEXT_ACTIONS_ENABLED, true, 'outage keeps the shipped default');

  console.log('platformFlags.service.test.ts passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
