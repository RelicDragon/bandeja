import assert from 'node:assert/strict';
import { ApiError } from '../../utils/ApiError';
import {
  applyEventUpdateInvariants,
  assertEventCreatePayload,
  eventCreateDefaults,
  parseEventCreatorIntent,
} from './eventCreateDefaults';

{
  assert.equal(parseEventCreatorIntent('looking'), 'looking');
  assert.equal(parseEventCreatorIntent('organizing'), 'organizing');
  assert.equal(parseEventCreatorIntent(undefined), 'organizing');
}

{
  assert.throws(() => assertEventCreatePayload({}), (err: unknown) => err instanceof ApiError);
  assert.throws(
    () => assertEventCreatePayload({ eventKind: 'CAMP', name: 'Camp' }),
    (err: unknown) => err instanceof ApiError,
  );
  assertEventCreatePayload({
    eventKind: 'CAMP',
    name: 'Camp',
    eventHeroes: [{ originalUrl: 'https://cdn.example/o.jpg', thumbnailUrl: 'https://cdn.example/t.jpg' }],
  });
}

{
  const { gameData, ownerLooking } = eventCreateDefaults({
    eventKind: 'CAMP',
    cityId: 'city-1',
    startTime: new Date('2026-09-01T10:00:00.000Z'),
    endTime: new Date('2026-09-03T18:00:00.000Z'),
    sport: 'PADEL',
    minLevel: 2.5,
    maxLevel: 4,
  });
  assert.equal(gameData.entityType, 'EVENT');
  assert.equal(gameData.eventApprovalStatus, 'ON_APPROVE');
  assert.equal(gameData.isPublic, true);
  assert.equal(gameData.allowDirectJoin, true);
  assert.equal(gameData.affectsRating, false);
  assert.equal(gameData.resultsByAnyone, false);
  assert.equal(ownerLooking, false);
  assert.equal(gameData.minLevel, 2.5);
  assert.equal(gameData.maxLevel, 4);
  assert.equal(ownerLooking, false);
}

{
  const looking = eventCreateDefaults({
    eventKind: 'TOURNAMENT',
    eventCreatorIntent: 'looking',
    cityId: 'city-1',
    startTime: new Date('2026-09-01T10:00:00.000Z'),
    endTime: new Date('2026-09-03T18:00:00.000Z'),
    sport: 'PADEL',
  });
  assert.equal(looking.ownerLooking, true);
}

{
  assert.throws(
    () => applyEventUpdateInvariants({ courtId: 'court-1' }),
    (err: unknown) => err instanceof ApiError,
  );
  assert.throws(
    () => applyEventUpdateInvariants({ hasBookedCourt: true }),
    (err: unknown) => err instanceof ApiError,
  );
  assert.throws(
    () => applyEventUpdateInvariants({ bookingIds: ['b1'] }),
    (err: unknown) => err instanceof ApiError,
  );
  assert.throws(
    () => applyEventUpdateInvariants({ externalBookingIds: ['b1'] }),
    (err: unknown) => err instanceof ApiError,
  );
  assert.throws(
    () => applyEventUpdateInvariants({ anyoneCanInvite: true }),
    (err: unknown) => err instanceof ApiError,
  );
  assert.throws(
    () => applyEventUpdateInvariants({ affectsRating: true }),
    (err: unknown) => err instanceof ApiError,
  );
  applyEventUpdateInvariants({ courtId: null, eventKind: 'LEAGUE', minLevel: 3 });
}

console.log('eventCreateDefaults.test.ts: ok');
