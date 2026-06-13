import { UNASSIGNED_COURT_KEY } from '../../shared/clubScheduleConstants';
import {
  isOccupancyHardBlock,
  isOccupancySoftBlock,
  mapExternalBlockToScheduleSlot,
  mapHoldBlockToScheduleSlot,
  mapOccupancyBlockToBookedCourtSlot,
  type OccupancyBlock,
} from './courtOccupancy.service';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const holdBlock: OccupancyBlock = {
  kind: 'hold',
  holdId: 'hold-1',
  holdLabel: 'WALK_IN',
  holdNote: 'maintenance',
  courtId: 'court-1',
  courtName: 'Court 1',
  integrationCourtName: 'BT-1',
  startTime: '2026-06-13T10:00:00.000Z',
  endTime: '2026-06-13T11:00:00.000Z',
  hasBookedCourt: true,
  clubBooked: true,
  isFree: false,
  holdBlocked: true,
};

const unconfirmedGameBlock: OccupancyBlock = {
  kind: 'game',
  gameId: 'game-1',
  courtId: 'court-1',
  courtName: 'Court 1',
  integrationCourtName: null,
  startTime: '2026-06-13T12:00:00.000Z',
  endTime: '2026-06-13T13:00:00.000Z',
  hasBookedCourt: false,
  clubBooked: false,
  isFree: false,
};

const externalBlock: OccupancyBlock = {
  kind: 'external',
  courtId: 'court-2',
  courtName: 'Court 2',
  integrationCourtName: 'BT-2',
  startTime: '2026-06-13T14:00:00.000Z',
  endTime: '2026-06-13T15:00:00.000Z',
  hasBookedCourt: true,
  clubBooked: true,
  isFree: false,
};

const unmappedExternalBlock: OccupancyBlock = {
  kind: 'external',
  courtId: UNASSIGNED_COURT_KEY,
  courtName: 'Unknown court',
  integrationCourtName: 'BT-unknown',
  startTime: '2026-06-13T16:00:00.000Z',
  endTime: '2026-06-13T17:00:00.000Z',
  hasBookedCourt: true,
  clubBooked: true,
  isFree: false,
};

function testHoldHardBlock(): void {
  assert(isOccupancyHardBlock(holdBlock), 'hold is hard block');
  const slot = mapOccupancyBlockToBookedCourtSlot(holdBlock);
  assert(slot.holdBlocked === true, 'hold maps holdBlocked');
  assert(slot.clubBooked === true, 'hold maps clubBooked');
  assert(slot.slotKind === 'hold', 'hold slot kind');
  const scheduleSlot = mapHoldBlockToScheduleSlot(holdBlock);
  assert(scheduleSlot?.type === 'hold', 'hold schedule slot type');
  if (scheduleSlot?.type === 'hold') {
    assert(scheduleSlot.label === 'WALK_IN', 'hold label preserved');
    assert(scheduleSlot.note === 'maintenance', 'hold note preserved');
  }
}

function testUnconfirmedSoftBlock(): void {
  assert(isOccupancySoftBlock(unconfirmedGameBlock), 'unconfirmed game is soft block');
  assert(!isOccupancyHardBlock(unconfirmedGameBlock), 'unconfirmed game is not hard block');
  const slot = mapOccupancyBlockToBookedCourtSlot(unconfirmedGameBlock);
  assert(slot.hasBookedCourt === false, 'unconfirmed hasBookedCourt false');
  assert(slot.clubBooked === false, 'unconfirmed clubBooked false');
  assert(slot.slotKind === 'game', 'game slot kind');
}

function testSnapshotClubBooked(): void {
  assert(isOccupancyHardBlock(externalBlock), 'external snapshot is hard block');
  assert(!isOccupancySoftBlock(externalBlock), 'external is not soft block');
  const slot = mapOccupancyBlockToBookedCourtSlot(externalBlock);
  assert(slot.clubBooked === true, 'external maps clubBooked');
  assert(slot.slotKind === 'external', 'external slot kind');
  const scheduleSlot = mapExternalBlockToScheduleSlot(externalBlock);
  assert(scheduleSlot?.type === 'external', 'external schedule slot type');
  assert(scheduleSlot?.courtId === 'court-2', 'external court id');
}

function testUnmappedExternalAdminLane(): void {
  const scheduleSlot = mapExternalBlockToScheduleSlot(unmappedExternalBlock);
  assert(scheduleSlot?.type === 'external', 'unmapped external schedule slot');
  if (scheduleSlot?.type === 'external') {
    assert(scheduleSlot.courtId === UNASSIGNED_COURT_KEY, 'unmapped uses UNASSIGNED_COURT_KEY');
    assert(scheduleSlot.courtName === 'Unknown court', 'unmapped court name preserved');
  }
  const playerSlot = mapOccupancyBlockToBookedCourtSlot(unmappedExternalBlock);
  assert(playerSlot.courtId === UNASSIGNED_COURT_KEY, 'player grid omits unmapped at query layer');
}

function run(): void {
  testHoldHardBlock();
  testUnconfirmedSoftBlock();
  testSnapshotClubBooked();
  testUnmappedExternalAdminLane();
  console.log('courtOccupancy.service: all checks passed');
}

run();
