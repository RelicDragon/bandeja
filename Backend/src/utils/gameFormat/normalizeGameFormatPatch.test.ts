import assert from 'node:assert/strict';
import { EntityType, ScoringPreset } from '@prisma/client';
import { normalizeGameFormatPatch } from './normalizeGameFormatPatch';
import {
  GAME_FORMAT_UPDATE_KEYS,
  isGameFormatOnlyUpdate,
} from '../../shared/gameFormatUpdateKeys';

const EMPTY_EXISTING = {
  gameType: 'CLASSIC',
  scoringPreset: null,
  scoringMode: null,
  matchTimerEnabled: false,
  matchTimedCapMinutes: 0,
  maxTotalPointsPerSet: 0,
  winnerOfMatch: 'BY_SCORES',
  playersPerMatch: 4,
  hasFixedTeams: false,
  allowUserInMultipleTeams: false,
  maxParticipants: 4,
  sport: 'PADEL' as const,
};

function normalizeCreateLike(patch: Record<string, unknown>) {
  return normalizeGameFormatPatch({
    existingGame: EMPTY_EXISTING,
    patch,
    entityType: EntityType.GAME,
  });
}

function normalizeUpdateLike(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  return normalizeGameFormatPatch({
    existingGame: { ...EMPTY_EXISTING, ...existing },
    patch,
    entityType: EntityType.GAME,
  });
}

function testLegacyTimedCreateUpdateParity(): void {
  const createPatch = {
    gameType: 'AMERICANO',
    scoringPreset: ScoringPreset.TIMED,
    matchTimedCapMinutes: 0,
    deucesBeforeGoldenPoint: 0,
    playersPerMatch: 4,
  };
  const createNorm = normalizeCreateLike(createPatch);
  const updateNorm = normalizeUpdateLike(
    { gameType: 'AMERICANO', scoringPreset: null },
    createPatch,
  );

  assert.equal(createNorm.scoringPreset, ScoringPreset.POINTS_21);
  assert.equal(updateNorm.scoringPreset, ScoringPreset.POINTS_21);
  assert.equal(createNorm.matchTimerEnabled, true);
  assert.equal(updateNorm.matchTimerEnabled, true);
  assert.equal(createNorm.maxTotalPointsPerSet, 21);
  assert.equal(updateNorm.maxTotalPointsPerSet, 21);
  assert.equal(createNorm.matchTimedCapMinutes, 15);
  assert.equal(updateNorm.matchTimedCapMinutes, 15);
  assert.equal(createNorm.deucesBeforeGoldenPoint, null);
  assert.equal(updateNorm.deucesBeforeGoldenPoint, null);
  assert.equal(createNorm.ballsInGames, false);
  assert.equal(updateNorm.ballsInGames, false);
}

function testSinglesClearsFixedTeams(): void {
  const norm = normalizeCreateLike({
    playersPerMatch: 2,
    hasFixedTeams: true,
    allowUserInMultipleTeams: true,
  });
  assert.equal(norm.playersPerMatch, 2);
  assert.equal(norm.hasFixedTeams, false);
  assert.equal(norm.allowUserInMultipleTeams, false);
}

function testClassicTimedNormalization(): void {
  const norm = normalizeCreateLike({
    gameType: 'CLASSIC',
    scoringPreset: ScoringPreset.CLASSIC_TIMED,
    matchTimedCapMinutes: 30,
  });
  assert.equal(norm.scoringPreset, ScoringPreset.CLASSIC_SINGLE_SET);
  assert.equal(norm.matchTimerEnabled, true);
  assert.equal(norm.matchTimedCapMinutes, 30);
  assert.equal(norm.ballsInGames, true);
}

function testTimerOffZerosCap(): void {
  const norm = normalizeUpdateLike(
    {
      scoringPreset: ScoringPreset.POINTS_16,
      matchTimerEnabled: true,
      matchTimedCapMinutes: 20,
    },
    { matchTimerEnabled: false },
  );
  assert.equal(norm.matchTimerEnabled, false);
  assert.equal(norm.matchTimedCapMinutes, 0);
}

function testAffectsRatingFormatOnlyGate(): void {
  assert.equal(
    isGameFormatOnlyUpdate({
      scoringPreset: 'POINTS_16',
      affectsRating: false,
    }),
    true,
    'affectsRating must count as format-only update',
  );
  assert(GAME_FORMAT_UPDATE_KEYS.has('affectsRating'), 'affectsRating in format key contract');
}

function testBallsInGamesClassicPreset(): void {
  const norm = normalizeCreateLike({
    gameType: 'CLASSIC',
    scoringPreset: ScoringPreset.CLASSIC_BEST_OF_3,
    deucesBeforeGoldenPoint: 0,
  });
  assert.equal(norm.ballsInGames, true);
  assert.equal(norm.deucesBeforeGoldenPoint, 0);
}

function testLeagueSeasonWinnerOfGameRemap(): void {
  const norm = normalizeGameFormatPatch({
    existingGame: {
      ...EMPTY_EXISTING,
      scoringMode: 'POINTS',
    },
    patch: {
      winnerOfGame: 'BY_POINTS',
      scoringMode: 'POINTS',
    },
    entityType: EntityType.LEAGUE_SEASON,
  });
  assert.equal(norm.winnerOfGame, 'BY_SCORES_DELTA');
}

function testLegacyHasGoldenPointWrite(): void {
  const on = normalizeCreateLike({ hasGoldenPoint: true, scoringMode: 'CLASSIC', scoringPreset: 'CLASSIC_BEST_OF_3' });
  assert.equal(on.deucesBeforeGoldenPoint, 0);
  const off = normalizeCreateLike({ hasGoldenPoint: false, scoringMode: 'CLASSIC', scoringPreset: 'CLASSIC_BEST_OF_3' });
  assert.equal(off.deucesBeforeGoldenPoint, null);
  assert.equal(
    isGameFormatOnlyUpdate({ hasGoldenPoint: true, scoringPreset: 'CLASSIC_BEST_OF_3' }),
    true,
    'legacy hasGoldenPoint counts as format-only update',
  );
  const newWins = normalizeCreateLike({
    hasGoldenPoint: true,
    deucesBeforeGoldenPoint: 2,
    scoringMode: 'CLASSIC',
    scoringPreset: 'CLASSIC_BEST_OF_3',
  });
  assert.equal(newWins.deucesBeforeGoldenPoint, 2, 'explicit deucesBeforeGoldenPoint wins over legacy boolean');
}

function run(): void {
  testLegacyTimedCreateUpdateParity();
  testSinglesClearsFixedTeams();
  testClassicTimedNormalization();
  testTimerOffZerosCap();
  testAffectsRatingFormatOnlyGate();
  testBallsInGamesClassicPreset();
  testLeagueSeasonWinnerOfGameRemap();
  testLegacyHasGoldenPointWrite();
  console.log('normalizeGameFormatPatch.test.ts: all passed');
}

run();
