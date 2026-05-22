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

function testPickleballRegistry(): void {
  const cfg = getSportConfig(Sport.PICKLEBALL);
  assert(cfg.implemented, 'pickleball implemented');
  assert(cfg.liveScoring === 'rally_points', 'pickleball liveScoring rally_points');
  assert(cfg.defaultScoringPreset === 'POINTS_21', 'default POINTS_21');
  assert(
    cfg.allowedPlayerCountsPerMatch.includes(2) && cfg.allowedPlayerCountsPerMatch.includes(4),
    '2 and 4 players per match',
  );
  assert(cfg.defaultPlayersPerMatch === 2, 'default 2 per match');
  assert(cfg.allowedScoringPresets.includes('POINTS_21'), 'POINTS_21 preset');
  assert(cfg.allowedScoringPresets.includes('POINTS_16'), 'POINTS_16 preset');
  assert(cfg.allowedScoringPresets.includes('POINTS_24'), 'POINTS_24 preset');
  assert(!cfg.allowedScoringPresets.includes('POINTS_11'), 'POINTS_11 reserved for table tennis');
  assert(!cfg.allowedScoringPresets.includes('CLASSIC_BEST_OF_3'), 'no classic preset');
  assert(cfg.allowedGameTypes.includes('CLASSIC') && !cfg.allowedGameTypes.includes('AMERICANO'), 'CLASSIC only');
}

function testPickleballValidation(): void {
  assert(
    validateGameForSport({
      sport: 'PICKLEBALL',
      maxParticipants: 8,
      playersPerMatch: 4,
      gameType: 'CLASSIC',
      scoringPreset: 'POINTS_21',
    }) === Sport.PICKLEBALL,
    'pickleball 8 roster doubles match',
  );
  assert(
    validateGameForSport({
      sport: 'PICKLEBALL',
      maxParticipants: 6,
      playersPerMatch: 2,
      scoringPreset: 'POINTS_16',
    }) === Sport.PICKLEBALL,
    'pickleball 6 roster singles match',
  );
  assertThrows(
    () =>
      validateGameForSport({
        sport: 'PICKLEBALL',
        maxParticipants: 4,
        scoringPreset: 'CLASSIC_BEST_OF_3',
      }),
    'pickleball rejects classic preset',
  );
  assertThrows(
    () =>
      validateGameForSport({
        sport: 'PICKLEBALL',
        maxParticipants: 4,
        gameType: 'AMERICANO',
        scoringPreset: 'POINTS_21',
      }),
    'pickleball rejects AMERICANO',
  );
  assert(
    validateGameForSport({
      sport: 'PICKLEBALL',
      maxParticipants: 6,
      scoringPreset: 'POINTS_21',
    }) === Sport.PICKLEBALL,
    'pickleball allows 6 event roster',
  );
  assertThrows(
    () =>
      validateGameForSport({
        sport: 'PICKLEBALL',
        playersPerMatch: 3,
        scoringPreset: 'POINTS_21',
      }),
    'pickleball rejects invalid playersPerMatch',
  );
}

function main(): void {
  testPickleballRegistry();
  testPickleballValidation();
  console.log('multisport-phase3-pickleball: all passed');
}

main();
