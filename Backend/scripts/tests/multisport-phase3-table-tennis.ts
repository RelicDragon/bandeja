import { Sport } from '@prisma/client';
import { getSportConfig } from '../../src/sport/sportRegistry';
import {
  validateGameForSport,
  validateMaxParticipants,
} from '../../src/utils/validators/validateGameForSport';
import { deriveBallsInGamesFromScoring } from '../../src/utils/scoring/deriveBallsInGames';
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

function main(): void {
  const cfg = getSportConfig(Sport.TABLE_TENNIS);
  assert(cfg.implemented, 'TABLE_TENNIS implemented');
  assert(cfg.allowedPlayerCountsPerMatch.join(',') === '2,4', '2/4 players per match');
  assert(cfg.defaultPlayersPerMatch === 2, 'default 2 per match');
  assert(cfg.defaultScoringPreset === 'BEST_OF_3_11', 'default BEST_OF_3_11');
  assert(cfg.allowedScoringPresets.includes('POINTS_11'), 'POINTS_11 allowed');
  assert(cfg.allowedScoringPresets.includes('BEST_OF_5_11'), 'BEST_OF_5_11 allowed');
  assert(!cfg.allowedScoringPresets.includes('CLASSIC_BEST_OF_3'), 'no tennis classic preset');
  assert(cfg.allowedGameTypes.includes('ROUND_ROBIN'), 'ROUND_ROBIN allowed');
  assert(cfg.allowedGameTypes.includes('LADDER'), 'LADDER allowed for box');
  assert(!cfg.allowedGameTypes.includes('AMERICANO'), 'no padel-style Americano on TT');
  assert(!cfg.rotationFormats.americano, 'rotation policy: no americano');

  assert(
    validateGameForSport({
      sport: 'TABLE_TENNIS',
      maxParticipants: 8,
      playersPerMatch: 2,
      gameType: 'ROUND_ROBIN',
      matchGenerationType: 'ROUND_ROBIN',
      scoringPreset: 'POINTS_11',
    }) === Sport.TABLE_TENNIS,
    'club RR singles POINTS_11',
  );

  assert(
    validateGameForSport({
      sport: 'TABLE_TENNIS',
      maxParticipants: 8,
      playersPerMatch: 2,
      scoringPreset: 'POINTS_11',
    }) === Sport.TABLE_TENNIS,
    'create 8 roster 1v1 POINTS_11',
  );
  assert(
    validateGameForSport({
      sport: 'TABLE_TENNIS',
      maxParticipants: 6,
      playersPerMatch: 4,
      scoringPreset: 'BEST_OF_5_11',
    }) === Sport.TABLE_TENNIS,
    'create 6 roster 2v2 BEST_OF_5_11',
  );
  assertThrows(() => validateMaxParticipants(3, 12), 'reject roster of 3');
  assertThrows(
    () => validateGameForSport({ sport: 'TABLE_TENNIS', maxParticipants: 4, scoringPreset: 'POINTS_21' }),
    'reject POINTS_21',
  );

  assert(
    deriveBallsInGamesFromScoring({
      sport: 'TABLE_TENNIS',
      scoringPreset: 'BEST_OF_3_11',
      winnerOfMatch: 'BY_SETS',
      maxTotalPointsPerSet: 11,
    }) === false,
    'ballsInGames false for TT',
  );

  console.log('multisport-phase3-table-tennis: all passed');
}

main();
