import assert from 'node:assert/strict';
import {
  gameSlotIntervalsOverlap,
  occupancyBlocksSlot,
  userIdsBusyInSlot,
  SLOT_BUSY_PARTICIPANT_STATUSES,
  SLOT_OVERLAP_ENTITY_TYPES,
  SLOT_OVERLAP_GAME_STATUSES,
  type SlotOccupancy,
  type SlotTarget,
} from '@bandeja/shared/gameSlotOverlap';

const t0 = new Date('2026-08-20T18:00:00.000Z');
const t1 = new Date('2026-08-20T19:00:00.000Z');
const t2 = new Date('2026-08-20T20:00:00.000Z');
const t3 = new Date('2026-08-20T21:00:00.000Z');

const target: SlotTarget = {
  gameId: 'target',
  startTime: t1,
  endTime: t2,
  timeIsSet: true,
};

function occupancy(over: Partial<SlotOccupancy> & Pick<SlotOccupancy, 'gameId'>): SlotOccupancy {
  return {
    status: 'PLAYING',
    startTime: t1,
    endTime: t2,
    timeIsSet: true,
    gameStatus: 'ANNOUNCED',
    entityType: 'GAME',
    ...over,
  };
}

assert.deepEqual([...SLOT_BUSY_PARTICIPANT_STATUSES], ['PLAYING']);
assert.deepEqual([...SLOT_OVERLAP_GAME_STATUSES], ['ANNOUNCED', 'STARTED']);
assert.ok(SLOT_OVERLAP_ENTITY_TYPES.includes('GAME'));
assert.ok(!(SLOT_OVERLAP_ENTITY_TYPES as readonly string[]).includes('BAR'));

assert.equal(gameSlotIntervalsOverlap(t0, t2, t1, t3), true);
assert.equal(gameSlotIntervalsOverlap(t0, t1, t1, t2), false);
assert.equal(gameSlotIntervalsOverlap(t0, t1, t2, t3), false);

assert.equal(
  occupancyBlocksSlot(occupancy({ gameId: 'other', startTime: t0, endTime: t2 }), target),
  true,
);
assert.equal(occupancyBlocksSlot(occupancy({ gameId: 'other', status: 'INVITED' }), target), false);
assert.equal(occupancyBlocksSlot(occupancy({ gameId: 'other', status: 'IN_QUEUE' }), target), false);

const busyIds = userIdsBusyInSlot(
  [
    { ...occupancy({ gameId: 'a', startTime: t0, endTime: t2 }), userId: 'busy' },
    { ...occupancy({ gameId: 'b', startTime: t2, endTime: t3 }), userId: 'free-touch' },
    { ...occupancy({ gameId: 'c', status: 'INVITED' }), userId: 'invited' },
  ],
  target,
);
assert.deepEqual(busyIds, ['busy']);

console.log('gameSlotOverlap tests passed');
