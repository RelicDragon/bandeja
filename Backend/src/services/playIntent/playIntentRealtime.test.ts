import assert from 'node:assert/strict';
import type { PlayIntentInvalidation } from '@bandeja/shared/playIntentRealtime';
import { publishCommittedPlayIntentTargetChanges } from './playIntentRealtime';

const originalSocketService = (global as { socketService?: unknown })
  .socketService;
const events: Array<{
  payload: PlayIntentInvalidation;
  userIds: string[];
}> = [];

try {
  (global as { socketService?: unknown }).socketService = {
    emitPlayIntentInvalidation(
      payload: PlayIntentInvalidation,
      userIds: string[],
    ) {
      events.push({ payload, userIds });
    },
  };

  publishCommittedPlayIntentTargetChanges([
    {
      id: 'intent-1',
      userId: 'user-1',
      cityId: 'city-1',
      sport: 'PADEL',
      entityType: 'GAME',
    },
    {
      id: 'intent-2',
      userId: 'user-2',
      cityId: 'city-1',
      sport: 'PADEL',
      entityType: 'GAME',
    },
    {
      id: 'intent-3',
      userId: 'user-3',
      cityId: 'city-1',
      sport: 'TENNIS',
      entityType: 'GAME',
    },
  ]);

  assert.equal(events.length, 2);
  const padel = events.find((event) => event.payload.sport === 'PADEL');
  assert.ok(padel);
  assert.equal(padel.payload.intentId, undefined);
  assert.deepEqual(padel.userIds, ['user-1', 'user-2']);
  const tennis = events.find((event) => event.payload.sport === 'TENNIS');
  assert.ok(tennis);
  assert.equal(tennis.payload.intentId, 'intent-3');
  assert.deepEqual(tennis.userIds, ['user-3']);
} finally {
  (global as { socketService?: unknown }).socketService =
    originalSocketService;
}

console.log('playIntentRealtime.test.ts: ok');
