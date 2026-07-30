import assert from 'node:assert/strict';
import {
  addProposalMemberBodySchema,
  createPlayIntentBodySchema,
  playIntentOptionalScopeQuerySchema,
} from './playIntent.schemas';

{
  const parsed = createPlayIntentBodySchema.parse({
    cityId: 'city-1',
    sport: 'PADEL',
    dayOffsets: [0, 2],
    timeOfDay: 'CUSTOM',
    startTime: '18:00',
    endTime: '20:00',
    clubIds: ['club-1'],
    minLevel: 2.5,
    maxLevel: 4,
  });
  assert.deepEqual(parsed.dayOffsets, [0, 2]);
}

assert.equal(
  createPlayIntentBodySchema.safeParse({
    dayOffsets: [0],
    dateKeys: ['2026-07-30'],
  }).success,
  false,
);
assert.equal(
  createPlayIntentBodySchema.safeParse({
    timeOfDay: 'CUSTOM',
    startTime: '18:00',
  }).success,
  false,
);
assert.equal(
  createPlayIntentBodySchema.safeParse({
    entityType: 'TRAINING',
  }).success,
  false,
);
assert.equal(
  createPlayIntentBodySchema.safeParse({
    unknown: true,
  }).success,
  false,
);
assert.equal(
  playIntentOptionalScopeQuerySchema.safeParse({
    cityId: ['not', 'a', 'string'],
  }).success,
  false,
);
assert.equal(
  playIntentOptionalScopeQuerySchema.safeParse({
    sport: 'TENNISS',
  }).success,
  false,
);
assert.equal(
  addProposalMemberBodySchema.safeParse({
    userId: 'user-1',
    intentId: 'intent-1',
  }).success,
  true,
);

console.log('playIntent.schemas.test.ts: ok');
