import assert from 'node:assert/strict';
import { addDays, subDays } from 'date-fns';
import { EntityType } from '@prisma/client';
import {
  calculateGameStatus,
  calculatePersistableGameStatus,
  isUnscoredClockFinished,
} from './gameStatus';

const TZ = 'Europe/Madrid';

function baseGame(overrides: Partial<Parameters<typeof calculateGameStatus>[0]> = {}) {
  const startTime = subDays(new Date(), 8);
  const endTime = addDays(startTime, 2);
  return {
    startTime,
    endTime,
    resultsStatus: 'NONE',
    timeIsSet: true,
    finishedDate: null,
    entityType: EntityType.GAME,
    ...overrides,
  };
}

function testGameArchivedAfterSevenDaysFromStart(): void {
  assert.equal(calculateGameStatus(baseGame(), TZ), 'ARCHIVED');
  assert.equal(
    calculateGameStatus(baseGame({ entityType: EntityType.TOURNAMENT, resultsStatus: 'FINAL' }), TZ),
    'ARCHIVED',
  );
}

function testGameNotArchivedBeforeSevenDaysFromStart(): void {
  const startTime = subDays(new Date(), 6);
  const endTime = addDays(new Date(), 1);
  assert.equal(
    calculateGameStatus(baseGame({ startTime, endTime, resultsStatus: 'IN_PROGRESS' }), TZ),
    'STARTED',
  );
  assert.equal(
    calculateGameStatus(baseGame({ startTime, endTime: subDays(new Date(), 1), resultsStatus: 'NONE' }), TZ),
    'FINISHED',
  );
}

function testStartTimeArchiveRuleDoesNotApplyToLeague(): void {
  const startTime = subDays(new Date(), 10);
  const endTime = subDays(new Date(), 9);
  assert.equal(
    calculateGameStatus(
      baseGame({
        entityType: EntityType.LEAGUE,
        startTime,
        endTime,
        resultsStatus: 'NONE',
      }),
      TZ,
    ),
    'FINISHED',
  );
}

function testStartTimeArchiveRuleSkippedWhenTimeNotSet(): void {
  assert.equal(
    calculateGameStatus(baseGame({ timeIsSet: false }), TZ),
    'ANNOUNCED',
  );
}

function testUnscoredClockFinishedIsNotPersisted(): void {
  const startTime = subDays(new Date(), 1);
  const endTime = subDays(new Date(), 1);
  const game = baseGame({ startTime, endTime, resultsStatus: 'NONE' });

  assert.equal(calculateGameStatus(game, TZ), 'FINISHED');
  assert.equal(isUnscoredClockFinished(game.entityType, 'FINISHED', 'NONE'), true);
  assert.equal(calculatePersistableGameStatus(game, TZ, 'STARTED'), 'STARTED');
  assert.equal(calculatePersistableGameStatus(game, TZ, 'ANNOUNCED'), 'ANNOUNCED');
}

function testScoredFinishedIsPersisted(): void {
  const startTime = subDays(new Date(), 1);
  const endTime = subDays(new Date(), 1);
  const game = baseGame({ startTime, endTime, resultsStatus: 'FINAL', finishedDate: new Date() });

  assert.equal(isUnscoredClockFinished(game.entityType, 'FINISHED', 'FINAL'), false);
  assert.equal(calculatePersistableGameStatus(game, TZ, 'STARTED'), 'FINISHED');
}

function testArchivedIsAlwaysPersisted(): void {
  assert.equal(calculatePersistableGameStatus(baseGame(), TZ, 'STARTED'), 'ARCHIVED');
}

function testNonResultsBasedTypesStillFinish(): void {
  const startTime = subDays(new Date(), 1);
  const endTime = subDays(new Date(), 1);
  assert.equal(
    calculatePersistableGameStatus(
      baseGame({ entityType: EntityType.EVENT, startTime, endTime, resultsStatus: 'NONE' }),
      TZ,
      'STARTED',
    ),
    'FINISHED',
  );
}

testGameArchivedAfterSevenDaysFromStart();
testGameNotArchivedBeforeSevenDaysFromStart();
testStartTimeArchiveRuleDoesNotApplyToLeague();
testStartTimeArchiveRuleSkippedWhenTimeNotSet();
testUnscoredClockFinishedIsNotPersisted();
testScoredFinishedIsPersisted();
testArchivedIsAlwaysPersisted();
testNonResultsBasedTypesStillFinish();

console.log('gameStatus.test.ts: ok');
