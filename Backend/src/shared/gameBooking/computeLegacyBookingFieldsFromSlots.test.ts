/**
 * Court slots → legacy bookingStatus / hasBookedCourt (pure), plus parity of the
 * adapter with the shared core `deriveCourtReservations` and with the previous
 * backend-only rule (frozen below) so every semantic difference is explicit.
 * Run: npm --prefix Backend run test:court-slots
 */
import assert from 'node:assert/strict';
import { computeBookingSelectionLimits } from '@bandeja/shared/gameBooking/computeBookingSelectionLimits';
import { deriveCourtReservations } from '@bandeja/shared/gameBooking/courtReservations';
import {
  computeLegacyBookingFieldsFromSlots,
  computeRequiredSlotCount,
  intervalsCoverWindow,
  toDeriveCourtReservationsInput,
  type ComputeLegacyBookingFieldsInput,
} from './computeLegacyBookingFieldsFromSlots';

const H = 60 * 60 * 1000;
const start = new Date('2026-11-01T18:00:00.000Z');
const end = new Date(start.getTime() + 2 * H);
const at = (hours: number) => new Date(start.getTime() + hours * H);

const base = (over: Partial<ComputeLegacyBookingFieldsInput>): ComputeLegacyBookingFieldsInput => ({
  slots: [],
  links: [],
  reportedAnyCourtCount: 0,
  startTime: start,
  endTime: end,
  maxParticipants: 4,
  playersPerMatch: 4,
  ...over,
});

/* ------------------------------------------------------------------------ *
 * The previous backend-only rule, frozen for the parity check.
 * ------------------------------------------------------------------------ */
function previousBackendRule(input: ComputeLegacyBookingFieldsInput): { bookingStatus: string; hasBookedCourt: boolean } {
  const toMs = (v: Date | string | null | undefined) => {
    if (v == null) return null;
    const ms = v instanceof Date ? v.getTime() : Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  };
  const roster = computeBookingSelectionLimits(input.maxParticipants, input.playersPerMatch === 2 ? 2 : 4);
  const n = input.slots.length;
  const required = Math.max(n > 0 ? Math.min(Math.max(1, n), roster.max) : roster.min, n);
  const slotIds = new Set(input.slots.map((s) => s.id));
  const groups = new Map<string, typeof input.links>();
  let noCourt = 0;
  for (const link of input.links) {
    let key: string;
    if (link.gameCourtId && slotIds.has(link.gameCourtId)) key = `slot:${link.gameCourtId}`;
    else if (link.courtId) key = `court:${link.courtId}`;
    else {
      key = 'court:none';
      noCourt += 1;
    }
    groups.set(key, [...(groups.get(key) ?? []), link]);
  }
  let reserved = Math.max(0, input.reportedAnyCourtCount);
  for (const slot of input.slots) if (slot.reservation === 'REPORTED' || groups.has(`slot:${slot.id}`)) reserved += 1;
  for (const key of groups.keys()) reserved += key === 'court:none' ? noCourt : key.startsWith('court:') ? 1 : 0;
  const hasLinks = input.links.length > 0;
  const hasBookedCourt = hasLinks || input.slots.some((s) => s.reservation === 'REPORTED') || input.reportedAnyCourtCount > 0;
  if (!hasLinks) return { bookingStatus: hasBookedCourt ? 'MANUAL' : 'NONE', hasBookedCourt };
  const s = toMs(input.startTime)!;
  const e = toMs(input.endTime)!;
  let covered = true;
  for (const group of groups.values()) {
    if (!intervalsCoverWindow(group.map((l) => ({ start: toMs(l.bookingStart), end: toMs(l.bookingEnd) })), s, e)) {
      covered = false;
    }
  }
  return { bookingStatus: covered && reserved >= required ? 'EXTERNAL_FULL' : 'EXTERNAL_PARTIAL', hasBookedCourt };
}

const cases: Array<{ name: string; input: ComputeLegacyBookingFieldsInput; status: string; hasBookedCourt: boolean; divergesFromPrevious?: string }> = [];
const check = (
  name: string,
  input: ComputeLegacyBookingFieldsInput,
  status: string,
  hasBookedCourt: boolean,
  divergesFromPrevious?: string,
) => {
  cases.push({ name, input, status, hasBookedCourt, divergesFromPrevious });
  const r = computeLegacyBookingFieldsFromSlots(input);
  assert.equal(r.bookingStatus, status, name);
  assert.equal(r.hasBookedCourt, hasBookedCourt, `${name}: hasBookedCourt`);
  return r;
};

// intervalsCoverWindow
assert.equal(intervalsCoverWindow([{ start: 0, end: 10 }], 0, 10), true);
assert.equal(intervalsCoverWindow([{ start: 0, end: 5 }, { start: 5, end: 10 }], 0, 10), true, 'back to back');
assert.equal(intervalsCoverWindow([{ start: 5, end: 10 }, { start: 0, end: 6 }], 0, 10), true, 'unsorted overlap');
assert.equal(intervalsCoverWindow([{ start: 0, end: 4 }, { start: 5, end: 10 }], 0, 10), false, 'gap');
assert.equal(intervalsCoverWindow([{ start: 1, end: 10 }], 0, 10), false, 'late start');
assert.equal(intervalsCoverWindow([{ start: null, end: 10 }], 0, 10), false, 'missing time');

// required slots (shared core: organizer decides — explicit courtSlotCount, else assigned, else roster)
assert.equal(computeRequiredSlotCount(4, 4, 0), 1);
assert.equal(computeRequiredSlotCount(8, 4, 0), 2);
assert.equal(computeRequiredSlotCount(8, 4, 1), 1, 'a selected court sets N (8-player rotation on one court)');
assert.equal(computeRequiredSlotCount(4, 4, 3), 3, 'never fewer than the slots listed');
assert.equal(computeRequiredSlotCount(4, 2, 0), 2, 'singles: 2 players per court');
assert.equal(computeRequiredSlotCount(16, 4, 2, 4), 4, 'explicit courtSlotCount adds any-court slots');
assert.equal(computeRequiredSlotCount(16, 4, 3, 1), 3, 'explicit courtSlotCount never below the assigned courts');
assert.equal(computeRequiredSlotCount(8, 4, 0, null), 2, 'null courtSlotCount = default rule');

// NONE / MANUAL
check('nothing', base({}), 'NONE', false);
check('planned slot', base({ slots: [{ id: 's1', courtId: 'c1', reservation: 'NONE' }] }), 'NONE', false);
check('reported slot', base({ slots: [{ id: 's1', courtId: 'c1', reservation: 'REPORTED' }] }), 'MANUAL', true);
check('reported without a court', base({ reportedAnyCourtCount: 1 }), 'MANUAL', true);

// EXTERNAL_FULL: one slot, one covering link
check(
  'one covering link',
  base({
    slots: [{ id: 's1', courtId: 'c1', reservation: 'NONE' }],
    links: [{ gameCourtId: 's1', courtId: 'c1', bookingStart: start, bookingEnd: end }],
  }),
  'EXTERNAL_FULL',
  true,
);

check(
  '15 minute gap',
  base({
    slots: [{ id: 's1', courtId: 'c1', reservation: 'NONE' }],
    links: [
      { gameCourtId: 's1', courtId: 'c1', bookingStart: start, bookingEnd: at(0.75) },
      { gameCourtId: 's1', courtId: 'c1', bookingStart: at(1), bookingEnd: end },
    ],
  }),
  'EXTERNAL_PARTIAL',
  true,
);

check(
  'back to back in one slot',
  base({
    slots: [{ id: 's1', courtId: 'c1', reservation: 'NONE' }],
    links: [
      { gameCourtId: 's1', courtId: 'c1', bookingStart: start, bookingEnd: at(1) },
      { gameCourtId: 's1', courtId: 'c1', bookingStart: at(1), bookingEnd: end },
    ],
  }),
  'EXTERNAL_FULL',
  true,
);

check(
  'coverage is per slot',
  base({
    maxParticipants: 8,
    slots: [
      { id: 's1', courtId: 'c1', reservation: 'NONE' },
      { id: 's2', courtId: 'c2', reservation: 'NONE' },
    ],
    links: [
      { gameCourtId: 's1', courtId: 'c1', bookingStart: start, bookingEnd: at(1) },
      { gameCourtId: 's2', courtId: 'c2', bookingStart: at(1), bookingEnd: end },
    ],
  }),
  'EXTERNAL_PARTIAL',
  true,
);

let r = check(
  'linked + reported',
  base({
    maxParticipants: 8,
    slots: [
      { id: 's1', courtId: 'c1', reservation: 'NONE' },
      { id: 's2', courtId: 'c2', reservation: 'REPORTED' },
    ],
    links: [{ gameCourtId: 's1', courtId: 'c1', bookingStart: start, bookingEnd: end }],
  }),
  'EXTERNAL_FULL',
  true,
);
assert.equal(r.reservedSlotCount, 2);

r = check(
  'unreserved required slot',
  base({
    maxParticipants: 8,
    slots: [
      { id: 's1', courtId: 'c1', reservation: 'NONE' },
      { id: 's2', courtId: 'c2', reservation: 'NONE' },
    ],
    links: [{ gameCourtId: 's1', courtId: 'c1', bookingStart: start, bookingEnd: end }],
  }),
  'EXTERNAL_PARTIAL',
  true,
);
assert.equal(r.requiredSlotCount, 2);

check(
  'two court-less bookings count as two courts',
  base({ maxParticipants: 8, links: [{ bookingStart: start, bookingEnd: end }, { bookingStart: start, bookingEnd: end }] }),
  'EXTERNAL_FULL',
  true,
);
check('one of two courts', base({ maxParticipants: 8, links: [{ bookingStart: start, bookingEnd: end }] }), 'EXTERNAL_PARTIAL', true);

check(
  'link short of the end',
  base({
    slots: [{ id: 's1', courtId: 'c1', reservation: 'NONE' }],
    links: [{ gameCourtId: 's1', courtId: 'c1', bookingStart: start, bookingEnd: at(1.5) }],
  }),
  'EXTERNAL_PARTIAL',
  true,
);
check(
  'missing link times',
  base({
    slots: [{ id: 's1', courtId: 'c1', reservation: 'NONE' }],
    links: [{ gameCourtId: 's1', courtId: 'c1', bookingStart: null, bookingEnd: null }],
  }),
  'EXTERNAL_PARTIAL',
  true,
);

r = check(
  'link whose slot is gone',
  base({
    slots: [{ id: 's1', courtId: 'c1', reservation: 'REPORTED' }],
    links: [{ gameCourtId: 'gone', courtId: 'c9', bookingStart: start, bookingEnd: end }],
  }),
  'EXTERNAL_FULL',
  true,
);
assert.equal(r.reservedSlotCount, 1, 'shared core: an unplaced link beyond N reserves nothing (previous rule: 2)');

check(
  'ISO strings',
  base({
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    slots: [{ id: 's1', courtId: 'c1', reservation: 'NONE' }],
    links: [{ gameCourtId: 's1', courtId: 'c1', bookingStart: start.toISOString(), bookingEnd: end.toISOString() }],
  }),
  'EXTERNAL_FULL',
  true,
);

check(
  '8 players, one court selected and fully linked',
  base({
    maxParticipants: 8,
    slots: [{ id: 's1', courtId: 'c1', reservation: 'NONE' }],
    links: [{ gameCourtId: 's1', courtId: 'c1', bookingStart: start, bookingEnd: end }],
  }),
  'EXTERNAL_FULL',
  true,
);
check(
  '8 players, organizer chose 2 courts, one linked',
  base({
    maxParticipants: 8,
    courtSlotCount: 2,
    slots: [{ id: 's1', courtId: 'c1', reservation: 'NONE' }],
    links: [{ gameCourtId: 's1', courtId: 'c1', bookingStart: start, bookingEnd: end }],
  }),
  'EXTERNAL_PARTIAL',
  true,
  'explicit courtSlotCount (new field; the previous rule had no such input)',
);
check(
  '16 players, organizer chose 1 court, no courts assigned, one link',
  base({ maxParticipants: 16, courtSlotCount: 1, links: [{ courtId: 'c1', bookingStart: start, bookingEnd: end }] }),
  'EXTERNAL_FULL',
  true,
  'explicit courtSlotCount (new field; the previous rule had no such input)',
);

// Documented divergences from the previous backend rule (shared core wins).
check(
  'reportedAnyCourtCount beyond the implicit slots',
  base({ slots: [{ id: 's1', courtId: 'c1', reservation: 'NONE' }], reportedAnyCourtCount: 1 }),
  'NONE',
  false,
  'reportedAnyCourtCount only fills implicit any-court slots (N − assigned)',
);
check(
  'unplaced link when every slot is assigned',
  base({
    slots: [{ id: 's1', courtId: 'c1', reservation: 'NONE' }],
    links: [{ courtId: 'c9', bookingStart: start, bookingEnd: end }],
  }),
  'EXTERNAL_PARTIAL',
  true,
  'an unplaced link beyond N does not reserve the planned slot',
);
check(
  'time not set: coverage skipped',
  base({
    timeIsSet: false,
    slots: [{ id: 's1', courtId: 'c1', reservation: 'NONE' }],
    links: [{ gameCourtId: 's1', courtId: 'c1', bookingStart: start, bookingEnd: at(1) }],
  }),
  'EXTERNAL_FULL',
  true,
  'timeIsSet=false: the shared core does not evaluate coverage',
);

/* ------------------------------------------------------------------------ *
 * Parity: the adapter equals the shared core on every case; vs the previous
 * backend rule only the documented divergences differ.
 * ------------------------------------------------------------------------ */
for (const c of cases) {
  const shared = deriveCourtReservations(toDeriveCourtReservationsInput(c.input));
  const adapter = computeLegacyBookingFieldsFromSlots(c.input);
  assert.equal(adapter.bookingStatus, shared.legacy.bookingStatus, `parity with shared core: ${c.name}`);
  assert.equal(
    adapter.hasBookedCourt,
    shared.legacy.hasBookedCourt || c.input.links.length > 0,
    `parity with shared core (+ links guard): ${c.name}`,
  );
  const previous = previousBackendRule(c.input);
  const same = previous.bookingStatus === adapter.bookingStatus && previous.hasBookedCourt === adapter.hasBookedCourt;
  if (c.divergesFromPrevious) {
    assert.ok(!same, `expected a documented divergence: ${c.name} (${c.divergesFromPrevious})`);
  } else {
    assert.ok(same, `parity with previous backend rule: ${c.name} (${JSON.stringify(previous)} vs ${adapter.bookingStatus})`);
  }
}

console.log(`computeLegacyBookingFieldsFromSlots.test.ts: ok (${cases.length} cases)`);
