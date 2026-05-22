import { Sport } from '@prisma/client';
import { getSportConfig } from '../../src/sport/sportRegistry';
import { validateGameForSport } from '../../src/utils/validators/validateGameForSport';
import { ApiError } from '../../src/utils/ApiError';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function assertThrows(fn: () => void, msg: string): void {
  try {
    fn();
    console.error('FAIL: expected throw —', msg);
    process.exit(1);
  } catch (e) {
    if (!(e instanceof ApiError)) {
      console.error('FAIL: wrong error type —', msg, e);
      process.exit(1);
    }
  }
}

const POINTS_PRESETS = ['POINTS_16', 'POINTS_21', 'POINTS_24', 'POINTS_32'] as const;

function testPickleballRegistryPointsAndCustom(): void {
  const cfg = getSportConfig(Sport.PICKLEBALL);
  for (const preset of POINTS_PRESETS) {
    assert(cfg.allowedScoringPresets.includes(preset), `registry allows ${preset}`);
  }
  assert(!cfg.allowedScoringPresets.includes('TIMED'), 'registry excludes TIMED (no live parity)');
  assert(cfg.allowedScoringPresets.includes('CUSTOM'), 'registry allows CUSTOM');
  assert(cfg.defaultScoringPreset === 'POINTS_21', 'default POINTS_21');
  console.log('ok: pickleball registry POINTS + CUSTOM, TIMED blocked');
}

function testPickleballValidator(): void {
  for (const preset of POINTS_PRESETS) {
    assert(
      validateGameForSport({
        sport: 'PICKLEBALL',
        maxParticipants: 4,
        playersPerMatch: 2,
        scoringPreset: preset,
      }) === Sport.PICKLEBALL,
      `validator accepts ${preset}`,
    );
  }
  validateGameForSport({
    sport: 'PICKLEBALL',
    maxParticipants: 4,
    playersPerMatch: 2,
    scoringPreset: 'CUSTOM',
  });
  assertThrows(
    () =>
      validateGameForSport({
        sport: 'PICKLEBALL',
        maxParticipants: 4,
        scoringPreset: 'TIMED',
      }),
    'pickleball rejects TIMED',
  );
  assertThrows(
    () =>
      validateGameForSport({
        sport: 'PICKLEBALL',
        maxParticipants: 4,
        scoringPreset: 'CLASSIC_BEST_OF_3',
      }),
    'pickleball still rejects classic preset',
  );
  console.log('ok: pickleball validateGameForSport');
}

function main(): void {
  testPickleballRegistryPointsAndCustom();
  testPickleballValidator();
  console.log('multisport-deferred-pickleball: all passed');
}

main();
