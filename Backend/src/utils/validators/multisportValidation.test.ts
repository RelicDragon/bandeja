import { Sport } from '@prisma/client';
import { getSportConfig, SPORT_REGISTRY } from '../../sport/sportRegistry';
import { getStrictValidationForPreset } from '../../shared/sportPresetMeta';
import { validateGameForSport } from './validateGameForSport';
import { SCORING_PRESETS, validateScoringPreset } from './gameFormat';
import { ApiError } from '../ApiError';

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
      console.error('FAIL: wrong error —', msg, e);
      process.exit(1);
    }
  }
}

const ALL_SPORTS = Object.keys(SPORT_REGISTRY) as Sport[];

assert(ALL_SPORTS.length === 6, 'six sports in registry');

for (const sport of ALL_SPORTS) {
  const cfg = getSportConfig(sport);
  assert(cfg.implemented, `${sport} implemented`);
  for (const preset of cfg.allowedScoringPresets) {
    assert(SCORING_PRESETS.includes(preset), `${sport} preset ${preset} in global enum`);
    validateGameForSport({ sport, playersPerMatch: cfg.defaultPlayersPerMatch, scoringPreset: preset });
  }
}

validateGameForSport({
  sport: 'PADEL',
  gameType: 'AMERICANO',
  matchGenerationType: 'RANDOM',
  playersPerMatch: 4,
  scoringPreset: 'POINTS_24',
});
assertThrows(
  () =>
    validateGameForSport({
      sport: 'PADEL',
      gameType: 'CLASSIC',
      matchGenerationType: 'RANDOM',
      playersPerMatch: 4,
      scoringPreset: 'POINTS_24',
    }),
  'padel RANDOM requires AMERICANO',
);
assertThrows(
  () =>
    validateGameForSport({
      sport: 'PADEL',
      gameType: 'AMERICANO',
      matchGenerationType: 'RATING',
      playersPerMatch: 4,
      scoringPreset: 'POINTS_24',
    }),
  'padel AMERICANO requires RANDOM',
);

validateGameForSport({
  sport: 'TENNIS',
  gameType: 'CLASSIC',
  matchGenerationType: 'AUTOMATIC',
  playersPerMatch: 2,
  scoringPreset: 'CLASSIC_FAST4',
});
validateGameForSport({
  sport: 'TENNIS',
  playersPerMatch: 4,
  scoringPreset: 'CLASSIC_BEST_OF_3',
});

assertThrows(
  () => validateGameForSport({ sport: 'SQUASH', playersPerMatch: 4, scoringPreset: 'BEST_OF_5_11' }),
  'squash 4p blocked',
);
validateGameForSport({ sport: 'SQUASH', playersPerMatch: 2, scoringPreset: 'BEST_OF_5_11' });

assertThrows(
  () =>
    validateGameForSport({
      sport: 'PICKLEBALL',
      matchGenerationType: 'RANDOM',
      playersPerMatch: 2,
      scoringPreset: 'POINTS_21',
    }),
  'pickleball americano doubles only',
);
validateGameForSport({
  sport: 'PICKLEBALL',
  gameType: 'AMERICANO',
  matchGenerationType: 'RANDOM',
  playersPerMatch: 4,
  scoringPreset: 'POINTS_21',
});

assert(getStrictValidationForPreset('BADMINTON', 'BEST_OF_3_21') === 'BWF_21', 'BWF on Bo3 21');
assert(getStrictValidationForPreset('BADMINTON', 'POINTS_21') === 'NONE', 'no BWF on POINTS_21');
assert(getStrictValidationForPreset('PICKLEBALL', 'BEST_OF_3_11') === 'PICKLEBALL_RALLY_11', 'pickleball strict');

assert(validateScoringPreset('CLASSIC', 'CLASSIC_FAST4') === 'CLASSIC_FAST4', 'CLASSIC_FAST4 on CLASSIC');
assert(validateScoringPreset('AMERICANO', 'POINTS_24') === 'POINTS_24', 'POINTS_24 on AMERICANO');
assertThrows(
  () => validateScoringPreset('CLASSIC', 'POINTS_24'),
  'ball-budget preset blocked on CLASSIC gameType',
);
assertThrows(() => validateScoringPreset('CLASSIC', 'NOT_A_PRESET'), 'unknown preset');

for (const preset of ['BEST_OF_3_15', 'BEST_OF_3_21', 'BEST_OF_5_11', 'CLASSIC_FAST4'] as const) {
  assert(SCORING_PRESETS.includes(preset), `enum includes ${preset}`);
}

console.log('ok: multisportValidation.test.ts');
