/**
 * MULTISPORT Phase 5 — Match size vs event roster (P5-H)
 * ADR-002: maxParticipants = roster; playersPerMatch = match format (2 / 4).
 */

import { Sport } from '@prisma/client';
import { getSportConfig } from '../../src/sport/sportRegistry';
import { getNumMatches } from '../../src/services/results/generation/matchUtils';
import type { GenGame } from '../../src/services/results/generation/types';
import {
  validateGameForSport,
  validateMaxParticipants,
} from '../../src/utils/validators/validateGameForSport';
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

function testPadelRosterVsMatch(): void {
  assert(
    validateGameForSport({
      sport: 'PADEL',
      maxParticipants: 8,
      playersPerMatch: 4,
      gameType: 'AMERICANO',
      scoringPreset: 'POINTS_32',
    }) === Sport.PADEL,
    'padel 8 roster + 2v2 match passes',
  );
  const cfg = getSportConfig(Sport.PADEL);
  assert(cfg.defaultPlayersPerMatch === 4, 'padel default match size 4');
  assert(cfg.allowedPlayerCountsPerMatch.join(',') === '2,4', 'padel allows 1v1 and 2v2');
}

function testSquashRejectsDoublesMatch(): void {
  const cfg = getSportConfig(Sport.SQUASH);
  assert(cfg.allowedPlayerCountsPerMatch.join(',') === '2', 'squash singles only');
  assert(cfg.defaultPlayersPerMatch === 2, 'squash default 1v1');
  assertThrows(
    () =>
      validateGameForSport({
        sport: 'SQUASH',
        playersPerMatch: 4,
        scoringPreset: 'BEST_OF_5_11',
      }),
    'squash rejects playersPerMatch=4',
  );
  assert(
    validateGameForSport({
      sport: 'SQUASH',
      maxParticipants: 8,
      playersPerMatch: 2,
      scoringPreset: 'BEST_OF_5_11',
    }) === Sport.SQUASH,
    'squash 8 roster + 1v1 match passes',
  );
}

function testTennisMatchSizes(): void {
  const cfg = getSportConfig(Sport.TENNIS);
  assert(cfg.allowedPlayerCountsPerMatch.includes(2) && cfg.allowedPlayerCountsPerMatch.includes(4), 'tennis 1v1/2v2');
  assert(
    validateGameForSport({ sport: 'TENNIS', playersPerMatch: 2, scoringPreset: 'CLASSIC_BEST_OF_3' }) ===
      Sport.TENNIS,
    'tennis 1v1',
  );
  assert(
    validateGameForSport({ sport: 'TENNIS', playersPerMatch: 4, scoringPreset: 'CLASSIC_BEST_OF_3' }) ===
      Sport.TENNIS,
    'tennis 2v2',
  );
}

function testGetNumMatchesRosterVsMatch(): void {
  const mk = (
    maxParticipants: number,
    playersPerMatch: number,
    n: number,
    courts: number,
  ): GenGame => ({
    id: 'qa',
    entityType: 'GAME',
    maxParticipants,
    playersPerMatch,
    participants: Array.from({ length: n }, (_, i) => ({
      userId: `u${i}`,
      status: 'PLAYING',
      user: { id: `u${i}`, level: 3, gender: 'MALE' },
    })),
    gameCourts: Array.from({ length: courts }, (_, i) => ({ courtId: `c${i}`, order: i })),
    genderTeams: 'ANY',
  });
  const game8d = mk(8, 4, 8, 2);
  assert(getNumMatches(game8d, game8d.participants) === 2, '8 roster 2v2 2 courts → 2 matches');
  const game8s = mk(8, 2, 8, 4);
  assert(getNumMatches(game8s, game8s.participants) === 4, '8 roster 1v1 4 courts → 4 matches');
}

function testValidateMaxParticipants(): void {
  assertThrows(() => validateMaxParticipants(3, 12), 'rejects roster size 3');
  validateMaxParticipants(2, 12);
  validateMaxParticipants(8, 12);
  assertThrows(() => validateMaxParticipants(13, 12), 'rejects above user cap');
}

function main(): void {
  testPadelRosterVsMatch();
  testSquashRejectsDoublesMatch();
  testTennisMatchSizes();
  testGetNumMatchesRosterVsMatch();
  testValidateMaxParticipants();
  console.log('multisport-phase5-match-size: all passed');
}

main();
