import assert from 'node:assert/strict';
import {
  legacyHasGoldenPointFromDeuces,
  withLegacyGoldenPointField,
} from './goldenPoint';
import { normalizeGameFormatPatch } from './normalizeGameFormatPatch';

function testReadMapping(): void {
  assert.equal(legacyHasGoldenPointFromDeuces(null), false);
  assert.equal(legacyHasGoldenPointFromDeuces(0), true);
  assert.equal(legacyHasGoldenPointFromDeuces(2), false, 'multi-deuce GP must not map to legacy true');

  const off = withLegacyGoldenPointField({ deucesBeforeGoldenPoint: null });
  assert.equal(off.hasGoldenPoint, false);
  assert.equal(off.deucesBeforeGoldenPoint, null);

  const immediate = withLegacyGoldenPointField({ deucesBeforeGoldenPoint: 0 });
  assert.equal(immediate.hasGoldenPoint, true);

  const padelModern = withLegacyGoldenPointField({ deucesBeforeGoldenPoint: 2 });
  assert.equal(padelModern.hasGoldenPoint, false);
}

function testWriteMapping(): void {
  const base = {
    gameType: 'CLASSIC',
    scoringPreset: null,
    scoringMode: 'CLASSIC',
    matchTimerEnabled: false,
    matchTimedCapMinutes: 0,
    maxTotalPointsPerSet: 0,
    winnerOfMatch: 'BY_SETS',
    playersPerMatch: 4,
    hasFixedTeams: false,
    allowUserInMultipleTeams: false,
    maxParticipants: 4,
    sport: 'PADEL',
  };

  const on = normalizeGameFormatPatch({
    existingGame: base,
    patch: { hasGoldenPoint: true, scoringMode: 'CLASSIC', scoringPreset: 'CLASSIC_BEST_OF_3' },
    entityType: 'GAME',
  });
  assert.equal(on.deucesBeforeGoldenPoint, 0);

  const off = normalizeGameFormatPatch({
    existingGame: base,
    patch: { hasGoldenPoint: false, scoringMode: 'CLASSIC', scoringPreset: 'CLASSIC_BEST_OF_3' },
    entityType: 'GAME',
  });
  assert.equal(off.deucesBeforeGoldenPoint, null);

  const explicit = normalizeGameFormatPatch({
    existingGame: base,
    patch: {
      hasGoldenPoint: true,
      deucesBeforeGoldenPoint: 2,
      scoringMode: 'CLASSIC',
      scoringPreset: 'CLASSIC_BEST_OF_3',
    },
    entityType: 'GAME',
  });
  assert.equal(explicit.deucesBeforeGoldenPoint, 2);
}

function testOldFeGetRulesSimulation(): void {
  /** Mirrors pre-migration FE `getRules`: GP on only when `game.hasGoldenPoint` is true. */
  function oldFeGoldenApplies(game: { hasGoldenPoint?: boolean; ballsInGames?: boolean; winnerOfMatch?: string }) {
    const goldenApplies = Boolean(game.ballsInGames) && game.winnerOfMatch === 'BY_SETS';
    return goldenApplies && Boolean(game.hasGoldenPoint);
  }

  const apiGame = withLegacyGoldenPointField({
    ballsInGames: true,
    winnerOfMatch: 'BY_SETS',
    deucesBeforeGoldenPoint: 0,
  });
  assert.equal(oldFeGoldenApplies(apiGame), true);

  const apiOff = withLegacyGoldenPointField({
    ballsInGames: true,
    winnerOfMatch: 'BY_SETS',
    deucesBeforeGoldenPoint: null,
  });
  assert.equal(oldFeGoldenApplies(apiOff), false);
}

function run(): void {
  testReadMapping();
  testWriteMapping();
  testOldFeGetRulesSimulation();
  console.log('goldenPointLegacyCompat.test.ts: all passed');
}

run();
