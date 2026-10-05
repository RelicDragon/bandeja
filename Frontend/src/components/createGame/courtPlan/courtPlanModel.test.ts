import { describe, expect, it } from 'vitest';
import type { OccupancyBlock } from '@shared/gameBooking/planReschedule';
import {
  assignSlotCourt,
  buildCreateCourtSlotsBody,
  courtSlotBounds,
  courtStatesForWindow,
  fillAnyCourtSlots,
  legacyHasBookedCourt,
  resizeCourtSlots,
  resolveCourtPlanCta,
  resolveInitialAtClubChoice,
  resolvePlanTimeBlock,
  seedCourtSlots,
  setSlotsReported,
  syncLinkedBookings,
  validateCourtPlan,
  type CourtPlanSlot,
} from './courtPlanModel';

const any = (reported = false): CourtPlanSlot => ({ courtId: null, bookingId: null, reported });
const court = (courtId: string, extra: Partial<CourtPlanSlot> = {}): CourtPlanSlot => ({
  courtId,
  bookingId: null,
  reported: false,
  ...extra,
});

const T0 = Date.parse('2026-10-10T18:00:00Z');
const T1 = Date.parse('2026-10-10T19:30:00Z');
const block = (courtId: string, kind: OccupancyBlock['kind'], start = '2026-10-10T18:30:00Z', end = '2026-10-10T19:00:00Z'): OccupancyBlock => ({
  courtId,
  kind,
  start,
  end,
});

describe('slots', () => {
  it('seeds picked courts first, then Any court', () => {
    expect(seedCourtSlots(['a', 'a', 'b'], 3)).toEqual([court('a'), court('b'), any()]);
    expect(seedCourtSlots([], 0)).toEqual([any()]);
  });

  it('bounds: at least one and every link, at most the club courts', () => {
    expect(courtSlotBounds(3, 0)).toEqual({ min: 1, max: 3 });
    expect(courtSlotBounds(0, 0)).toEqual({ min: 1, max: 16 });
    expect(courtSlotBounds(1, 2)).toEqual({ min: 2, max: 2 });
  });

  it('resizes without dropping linked slots', () => {
    const slots = [court('a'), court('b', { bookingId: 'x' }), any()];
    expect(resizeCourtSlots(slots, 1)).toEqual([court('b', { bookingId: 'x' })]);
    expect(resizeCourtSlots([court('a')], 2, true)).toEqual([court('a'), any(true)]);
  });

  it('swaps a court that another slot already has', () => {
    expect(assignSlotCourt([court('a'), court('b')], 0, 'b')).toEqual([court('b'), court('a')]);
    expect(assignSlotCourt([court('a'), any()], 1, 'a')).toEqual([any(), court('a')]);
  });

  it('never moves a linked court', () => {
    const slots = [court('a', { bookingId: 'x' }), any()];
    expect(assignSlotCourt(slots, 0, 'b')).toBe(slots);
    expect(assignSlotCourt(slots, 1, 'a')).toBe(slots);
  });
});

describe('syncLinkedBookings', () => {
  it('fills the slot with the same court, then Any court, then grows', () => {
    const slots = [court('a'), any()];
    const once = syncLinkedBookings(slots, [{ id: 'x', courtId: 'a' }]);
    expect(once).toEqual([court('a', { bookingId: 'x' }), any()]);
    const twice = syncLinkedBookings(once, [
      { id: 'x', courtId: 'a' },
      { id: 'y', courtId: 'c' },
      { id: 'z', courtId: 'd' },
    ]);
    expect(twice).toEqual([
      court('a', { bookingId: 'x' }),
      court('c', { bookingId: 'y' }),
      court('d', { bookingId: 'z' }),
    ]);
  });

  it('moves the court off a picked slot and frees unselected links', () => {
    const slots = [court('a'), court('b')];
    expect(syncLinkedBookings(slots, [{ id: 'x', courtId: 'b' }])).toEqual([
      court('a'),
      court('b', { bookingId: 'x' }),
    ]);
    const linked = [court('a', { bookingId: 'x' }), any()];
    expect(syncLinkedBookings(linked, [])).toEqual([court('a'), any()]);
  });

  it('a linked slot is never "marked" reserved', () => {
    const slots = setSlotsReported([any(), any()], true);
    const linked = syncLinkedBookings(slots, [{ id: 'x', courtId: 'a' }]);
    expect(linked[0]).toEqual(court('a', { bookingId: 'x' }));
    expect(linked[1]).toEqual(any(true));
  });
});

describe('occupancy', () => {
  it('classifies hard and soft per court over the window', () => {
    const states = courtStatesForWindow(
      [
        block('a', 'club'),
        block('b', 'app_game_planned'),
        block('c', 'app_game_reserved'),
        block('d', 'hold', '2026-10-10T19:30:00Z', '2026-10-10T20:00:00Z'),
      ],
      ['a', 'b', 'c', 'd'],
      T0,
      T1,
    );
    expect(states.get('a')).toEqual({ hard: 'club', soft: false });
    expect(states.get('b')).toEqual({ hard: null, soft: true });
    expect(states.get('c')).toEqual({ hard: 'app_game_reserved', soft: false });
    expect(states.get('d')).toEqual({ hard: null, soft: false });
  });

  it('blocks a picked court that is hard-blocked, notes a planned game', () => {
    const states = courtStatesForWindow([block('a', 'hold'), block('b', 'app_game_planned')], ['a', 'b'], T0, T1);
    expect(resolvePlanTimeBlock({ slots: [court('a')], states, poolCourtIds: ['a', 'b'], trustReported: false })).toEqual({
      kind: 'hard',
      reason: 'hold',
      courtId: 'a',
    });
    expect(resolvePlanTimeBlock({ slots: [court('b')], states, poolCourtIds: ['a', 'b'], trustReported: false })).toEqual({
      kind: 'soft',
    });
  });

  it('counts free courts for Any court slots', () => {
    const states = courtStatesForWindow([block('a', 'club')], ['a', 'b', 'c'], T0, T1);
    expect(resolvePlanTimeBlock({ slots: [any(), any()], states, poolCourtIds: ['a', 'b', 'c'], trustReported: false })).toBeNull();
    expect(
      resolvePlanTimeBlock({ slots: [court('b'), any(), any()], states, poolCourtIds: ['a', 'b', 'c'], trustReported: false }),
    ).toEqual({ kind: 'hard', reason: 'notEnoughCourts', free: 1, needed: 2 });
  });

  it('own reservations and marked courts never block themselves', () => {
    const states = courtStatesForWindow([block('a', 'club')], ['a'], T0, T1);
    expect(
      resolvePlanTimeBlock({ slots: [court('a', { bookingId: 'x' })], states, poolCourtIds: ['a'], trustReported: false }),
    ).toBeNull();
    expect(
      resolvePlanTimeBlock({ slots: [court('a', { reported: true })], states, poolCourtIds: ['a'], trustReported: true }),
    ).toBeNull();
  });

  it('fills Any court slots with free courts first', () => {
    const states = courtStatesForWindow([block('a', 'app_game_planned'), block('b', 'club')], ['a', 'b', 'c'], T0, T1);
    expect(fillAnyCourtSlots([any()], states, ['a', 'b', 'c'])).toEqual([court('c')]);
    expect(fillAnyCourtSlots([any(), any()], states, ['a', 'b', 'c'])).toEqual([court('c'), court('a')]);
    expect(fillAnyCourtSlots([any(), any(), any()], states, ['a', 'b', 'c'])).toBeNull();
  });
});

describe('cta', () => {
  it('states what will happen for every game type', () => {
    const slots = [any(), any()];
    expect(resolveCourtPlanCta({ entityType: 'TOURNAMENT', choice: 'reserveNow', slots })).toEqual({
      key: 'createGame.courtPlan.cta.reserve',
      values: { count: 2 },
    });
    expect(
      resolveCourtPlanCta({ entityType: 'GAME', choice: 'alreadyReserved', slots: setSlotsReported(slots, true) }),
    ).toEqual({ key: 'createGame.courtPlan.cta.withReserved', values: { count: 2 } });
    expect(resolveCourtPlanCta({ entityType: 'TRAINING', choice: 'notYet', slots })).toEqual({
      key: 'createGame.createButtonTraining',
    });
    expect(resolveCourtPlanCta({ entityType: 'BAR', choice: 'reserveNow', slots })).toEqual({
      key: 'createGame.createButtonBar',
    });
  });
});

describe('validation', () => {
  const base = {
    choice: 'notYet' as const,
    needsAuth: false,
    selectedTime: '18:00',
    duration: 1.5,
    timeBlock: null,
    slots: [any()],
    bookableCourtIds: new Set<string>(),
    anyCourtsFillable: true,
    pendingReservationCount: 0,
  };

  it('asks for the missing piece in flow order', () => {
    expect(validateCourtPlan({ ...base, choice: 'reserveNow', needsAuth: true })).toEqual({ ok: false, reason: 'authRequired' });
    expect(validateCourtPlan({ ...base, selectedTime: '' })).toEqual({ ok: false, reason: 'timeRequired' });
    expect(validateCourtPlan({ ...base, timeBlock: { kind: 'soft' } })).toEqual({ ok: true });
    expect(
      validateCourtPlan({ ...base, timeBlock: { kind: 'hard', reason: 'club', courtId: 'a' } }),
    ).toEqual({ ok: false, reason: 'timeBlocked' });
  });

  it('reserve now needs bookable courts', () => {
    expect(validateCourtPlan({ ...base, choice: 'reserveNow', slots: [court('a')] })).toEqual({
      ok: false,
      reason: 'courtNotBookable',
    });
    expect(validateCourtPlan({ ...base, choice: 'reserveNow', anyCourtsFillable: false })).toEqual({
      ok: false,
      reason: 'notEnoughBookableCourts',
    });
  });
});

describe('payload', () => {
  it('sends slots in order with reports, any-court reports and the count', () => {
    const slots = [court('a', { bookingId: 'x' }), court('b', { reported: true }), any(true), any()];
    expect(buildCreateCourtSlotsBody(slots)).toEqual({
      slots: [
        { courtId: 'a', reservation: 'NONE' },
        { courtId: 'b', reservation: 'REPORTED' },
      ],
      reportedAnyCourtCount: 1,
      courtSlotCount: 4,
    });
    expect(legacyHasBookedCourt(slots)).toBe(true);
    expect(legacyHasBookedCourt([any()])).toBe(false);
  });

  it('starts from what the draft says', () => {
    const base = { canReserveNow: true, hasPreselectedBookings: false, initialHasBookedCourt: false, fromPlayIntent: false };
    expect(resolveInitialAtClubChoice(base)).toBe('reserveNow');
    expect(resolveInitialAtClubChoice({ ...base, canReserveNow: false })).toBe('notYet');
    expect(resolveInitialAtClubChoice({ ...base, hasPreselectedBookings: true })).toBe('alreadyReserved');
    expect(resolveInitialAtClubChoice({ ...base, fromPlayIntent: true })).toBe('notYet');
  });
});
