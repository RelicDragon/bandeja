import assert from 'node:assert/strict';
import { BracketSlotKind } from '@prisma/client';
import { buildBracketPlan } from './bracketStructure';
import {
  bracketScheduleKey,
  normalizeBracketSchedules,
  type BracketSlotSchedulePayload,
} from './bracketSchedule.util';

const plan = buildBracketPlan(
  8,
  Array.from({ length: 8 }, (_, i) => `team-${i + 1}`),
  { includeThirdPlace: true }
);
assert.equal(plan.slots.filter((slot) => slot.slotKind !== BracketSlotKind.BYE).length, 8);

const waves = [
  ['MAIN-R0-M0', '2026-08-02T08:00:00.000Z', '2026-08-02T08:45:00.000Z', 'court-3'],
  ['MAIN-R0-M1', '2026-08-02T08:00:00.000Z', '2026-08-02T08:45:00.000Z', 'court-4'],
  ['MAIN-R0-M2', '2026-08-02T08:00:00.000Z', '2026-08-02T08:45:00.000Z', 'court-6'],
  ['MAIN-R0-M3', '2026-08-02T08:00:00.000Z', '2026-08-02T08:45:00.000Z', 'court-5'],
  ['MAIN-R1-M0', '2026-08-02T08:45:00.000Z', '2026-08-02T09:30:00.000Z', 'court-3'],
  ['MAIN-R1-M1', '2026-08-02T08:45:00.000Z', '2026-08-02T09:30:00.000Z', 'court-4'],
  ['MAIN-R2-M0', '2026-08-02T09:30:00.000Z', '2026-08-02T10:15:00.000Z', 'court-3'],
  ['THIRD-M0', '2026-08-02T09:30:00.000Z', '2026-08-02T10:15:00.000Z', 'court-4'],
] as const;

const schedules: BracketSlotSchedulePayload[] = waves.map(([slotKey, startTime, endTime, courtId]) => ({
  leagueGroupId: 'group-c',
  slotKey,
  clubId: 'ksc',
  courtId,
  startTime,
  endTime,
}));

const normalized = normalizeBracketSchedules(schedules, [{ leagueGroupId: 'group-c', plan }]);
assert.equal(normalized.size, 8);
assert.equal(
  normalized.get(bracketScheduleKey('group-c', 'MAIN-R2-M0'))?.courtId,
  'court-3'
);

assert.throws(
  () => normalizeBracketSchedules(schedules.slice(0, -1), [{ leagueGroupId: 'group-c', plan }]),
  /must include every playable fixture/
);
assert.throws(
  () =>
    normalizeBracketSchedules(
      schedules.map((row) =>
        row.slotKey === 'MAIN-R1-M0'
          ? { ...row, courtId: 'court-7', startTime: '2026-08-02T08:30:00.000Z' }
          : row
      ),
      [{ leagueGroupId: 'group-c', plan }]
    ),
  /before feeder/
);

console.log('bracketSchedule.util.test.ts: ok');
