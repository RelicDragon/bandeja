import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { findLockedFieldChanges } from './gameResultsLockedFields';

// Locked fields echoed back unchanged are a no-op, not a violation.
assert.deepEqual(
  findLockedFieldChanges(
    { name: 'Evening game', maxParticipants: 4 },
    { name: 'Evening game', maxParticipants: 4 },
  ),
  [],
);

assert.deepEqual(findLockedFieldChanges({ name: 'Evening game' }, { name: 'Morning game' }), [
  'name',
]);
assert.deepEqual(findLockedFieldChanges({ maxParticipants: 4 }, { maxParticipants: 8 }), [
  'maxParticipants',
]);

assert.deepEqual(findLockedFieldChanges({ name: 'a' }, { name: undefined }), []);

// The results machinery, format wizard keys and league wiring stay writable.
assert.deepEqual(
  findLockedFieldChanges(
    {},
    {
      status: 'FINISHED',
      resultsStatus: 'FINAL',
      resultsMeta: { a: 1 },
      finishedDate: new Date(),
      teamsReady: true,
      participantsReady: true,
      scoringPreset: 'CLASSIC_3',
      hasFixedTeams: true,
      affectsRating: false,
      parentId: 'p1',
      leagueRoundId: 'r1',
      metadata: { x: 1 },
      mediaUrls: ['u'],
    },
  ),
  [],
);

const startTime = new Date('2026-06-12T10:00:00.000Z');
assert.deepEqual(
  findLockedFieldChanges({ startTime }, { startTime: '2026-06-12T10:00:00.000Z' }),
  [],
);
assert.deepEqual(findLockedFieldChanges({ startTime }, { startTime: '2026-06-12T11:00:00.000Z' }), [
  'startTime',
]);

assert.deepEqual(findLockedFieldChanges({ priceTotal: new Prisma.Decimal('40') }, { priceTotal: 40 }), []);
assert.deepEqual(findLockedFieldChanges({ priceTotal: new Prisma.Decimal('40') }, { priceTotal: 50 }), [
  'priceTotal',
]);

assert.deepEqual(findLockedFieldChanges({ courtId: null }, { courtId: null }), []);
assert.deepEqual(findLockedFieldChanges({ courtId: null }, { courtId: 'c1' }), ['courtId']);

console.log('gameResultsLockedFields.test.ts ok');
