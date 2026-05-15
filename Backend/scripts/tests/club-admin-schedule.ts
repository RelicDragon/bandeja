#!/usr/bin/env ts-node
/**
 * Unit checks for club admin schedule helpers.
 * Run: npx ts-node scripts/tests/club-admin-schedule.ts
 */

import {
  detectScheduleConflicts,
  scheduleSlotCourtKey,
  UNASSIGNED_COURT_KEY,
} from '../../src/services/clubAdmin/clubAdminSchedule.service';
import type { ScheduleSlot } from '../../src/services/clubAdmin/clubAdmin.types';

const host = { id: 'u1', firstName: 'A', lastName: 'B', avatar: null };

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

const baseGame = {
  hasBookedCourt: false,
  status: 'ANNOUNCED' as const,
  entityType: 'GAME' as const,
  name: null,
  host,
  participantCount: 2,
};

const unassigned: ScheduleSlot = {
  type: 'game',
  gameId: 'g1',
  courtId: null,
  startTime: '2026-05-15T10:00:00.000Z',
  endTime: '2026-05-15T11:00:00.000Z',
  ...baseGame,
};

const courtGame: ScheduleSlot = {
  type: 'game',
  gameId: 'g2',
  courtId: 'c1',
  startTime: '2026-05-15T10:00:00.000Z',
  endTime: '2026-05-15T11:00:00.000Z',
  ...baseGame,
};

assert(scheduleSlotCourtKey(unassigned) === UNASSIGNED_COURT_KEY, 'unassigned court key');
assert(scheduleSlotCourtKey(courtGame) === 'c1', 'assigned court key');

const conflicts = detectScheduleConflicts([unassigned, courtGame]);
assert(conflicts.length === 0, 'different court keys should not conflict');

const overlapA: ScheduleSlot = {
  type: 'hold',
  holdId: 'h1',
  courtId: 'c1',
  label: 'WALK_IN',
  note: null,
  startTime: '2026-05-15T10:00:00.000Z',
  endTime: '2026-05-15T11:00:00.000Z',
};

const overlapB: ScheduleSlot = {
  type: 'external',
  courtId: 'c1',
  courtName: 'Court 1',
  startTime: '2026-05-15T10:30:00.000Z',
  endTime: '2026-05-15T11:30:00.000Z',
};

const c2 = detectScheduleConflicts([overlapA, overlapB]);
assert(c2.length === 1, 'hold + external overlap on same court');

console.log('club-admin-schedule: all checks passed');
