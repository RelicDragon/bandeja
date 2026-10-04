import assert from 'node:assert/strict';
import type { IntentCriteria } from './playIntentCriteria';
import {
  DEMAND_SLOTS_CAP,
  buildDemandSlots,
  demandMemberFitsViewer,
  demandSlotIsOpen,
  periodsCoveredBy,
  type DemandIntent,
  type DemandViewer,
} from './playIntentDemandSlots';

const TODAY = '2026-10-06';
const TOMORROW = '2026-10-07';
const DAYS = [TODAY, TOMORROW, '2026-10-08'];

function criteria(over: Partial<IntentCriteria> = {}): IntentCriteria {
  return {
    dateKeys: [TODAY],
    clubIds: [],
    minLevel: null,
    maxLevel: null,
    timeOfDay: 'EVENING',
    timeOfDays: ['EVENING'],
    startTime: null,
    endTime: null,
    genderTeams: 'ANY',
    userLevel: 3,
    userGender: 'MALE',
    ...over,
  };
}

function intent(userId: string, over: Partial<IntentCriteria> = {}): DemandIntent {
  return {
    intentId: `i-${userId}`,
    userId,
    criteria: criteria(over),
    firstName: userId,
    lastName: null,
    avatar: null,
    gender: over.userGender ?? 'MALE',
  };
}

const viewer: DemandViewer = { userId: 'me', level: 3, gender: 'MALE', intent: null };

function build(intents: DemandIntent[], over: Partial<Parameters<typeof buildDemandSlots>[0]> = {}) {
  return buildDemandSlots({
    viewer,
    intents,
    dayKeys: DAYS,
    todayKey: TODAY,
    nowMinutes: 9 * 60,
    busyByDateKey: new Map(),
    ...over,
  });
}

// --- periods ---------------------------------------------------------------
assert.deepEqual(periodsCoveredBy(criteria({ timeOfDay: 'ANYTIME', timeOfDays: ['ANYTIME'] })), [
  'MORNING',
  'AFTERNOON',
  'EVENING',
]);
assert.deepEqual(periodsCoveredBy(criteria({ timeOfDays: ['MORNING', 'EVENING'] })), ['MORNING', 'EVENING']);
// Custom 17:00–20:00 covers 2 h of evening but only 1 h of afternoon — both count (≥ 60 min).
assert.deepEqual(
  periodsCoveredBy(criteria({ timeOfDay: 'CUSTOM', timeOfDays: ['CUSTOM'], startTime: '17:00', endTime: '20:00' })),
  ['AFTERNOON', 'EVENING'],
);
// 17:30–19:00 is only 30 min of afternoon.
assert.deepEqual(
  periodsCoveredBy(criteria({ timeOfDay: 'CUSTOM', timeOfDays: ['CUSTOM'], startTime: '17:30', endTime: '19:00' })),
  ['EVENING'],
);

// --- open window -------------------------------------------------------------
assert.equal(demandSlotIsOpen(TODAY, 'MORNING', TODAY, 10 * 60 + 31), false, 'needs 90 min left');
assert.equal(demandSlotIsOpen(TODAY, 'MORNING', TODAY, 10 * 60 + 30), true);
assert.equal(demandSlotIsOpen('2026-10-05', 'EVENING', TODAY, 0), false, 'past day');
assert.equal(demandSlotIsOpen(TOMORROW, 'MORNING', TODAY, 23 * 60), true);

// --- fit -------------------------------------------------------------------
assert.equal(demandMemberFitsViewer(viewer, intent('a', { userLevel: 3.5 })), true);
assert.equal(demandMemberFitsViewer(viewer, intent('a', { userLevel: 3.6 })), false, 'level gap > 0.5');
assert.equal(demandMemberFitsViewer(viewer, intent('a', { userLevel: 2.5 })), true, 'gap 0.5 below still fits');
assert.equal(demandMemberFitsViewer(viewer, intent('a', { minLevel: 3.5 })), false, 'viewer below their band');
assert.equal(demandMemberFitsViewer(viewer, intent('a', { genderTeams: 'WOMEN' })), false);
assert.equal(demandMemberFitsViewer({ ...viewer, level: null }, intent('a', { userLevel: 6 })), true, 'unknown level passes');
assert.equal(
  demandMemberFitsViewer({ ...viewer, intent: criteria({ clubIds: ['c1'] }) }, intent('a', { clubIds: ['c2'] })),
  false,
  'viewer intent clubs must intersect',
);

// --- buckets ---------------------------------------------------------------
{
  const slots = build([
    intent('a'),
    intent('b', { timeOfDay: 'ANYTIME', timeOfDays: ['ANYTIME'] }),
    intent('c', { userLevel: 5 }),
    intent('d', { dateKeys: [TOMORROW] }),
  ]);
  const evening = slots.find((s) => s.key === `${TODAY}:EVENING`)!;
  assert.equal(evening.count, 3);
  assert.equal(evening.fitCount, 2, 'c is too far in level');
  assert.deepEqual(
    evening.members.map((m) => [m.userId, m.fitsViewer]),
    [
      ['a', true],
      ['b', true],
      ['c', false],
    ],
    'fitting first',
  );
  assert.equal(slots[0].key, `${TODAY}:EVENING`, 'most fitting slot first');
  assert.ok(slots.some((s) => s.key === `${TODAY}:AFTERNOON` && s.count === 1), 'ANYTIME lands in every open period');
  assert.ok(slots.some((s) => s.key === `${TOMORROW}:EVENING` && s.count === 1));
  assert.ok(!slots.some((s) => s.dateKey === '2026-10-08'), 'no empty slots');
}

// The viewer is never a member of their own slot, and viewerIn reflects their intent.
{
  const slots = build([intent('me'), intent('a')], {
    viewer: { ...viewer, intent: criteria({ timeOfDays: ['EVENING'] }) },
  });
  assert.equal(slots.length, 1);
  assert.equal(slots[0].viewerIn, true);
  assert.deepEqual(slots[0].members.map((m) => m.userId), ['a']);
}

// Busy that day → not offered for that day.
{
  const slots = build([intent('a', { dateKeys: [TODAY, TOMORROW] })], {
    busyByDateKey: new Map([[TODAY, new Set(['a'])]]),
  });
  assert.deepEqual(slots.map((s) => s.key), [`${TOMORROW}:EVENING`]);
}

// Common clubs: [] = any, intersection when some care, null when they disagree.
{
  const any = build([intent('a'), intent('b')]);
  assert.deepEqual(any[0].clubIds, []);
  const some = build([intent('a', { clubIds: ['c1', 'c2'] }), intent('b', { clubIds: ['c2'] })]);
  assert.deepEqual(some[0].clubIds, ['c2']);
  const clash = build([intent('a', { clubIds: ['c1'] }), intent('b', { clubIds: ['c2'] })]);
  assert.equal(clash[0].clubIds, null);
}

// Cap.
{
  const many = DAYS.flatMap((d, i) =>
    ['MORNING', 'AFTERNOON', 'EVENING'].map((p, j) =>
      intent(`u${i}${j}`, { dateKeys: [d], timeOfDay: p as never, timeOfDays: [p as never] }),
    ),
  );
  assert.equal(build(many, { nowMinutes: 0 }).length, DEMAND_SLOTS_CAP);
}

console.log('playIntentDemandSlots.test: ok');
