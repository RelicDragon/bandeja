import { describe, expect, it } from 'vitest';
import { PLAN_STEP_PHASE, planReschedule, type PlanRescheduleInput } from '@shared/gameBooking/planReschedule';
import {
  applyRescheduleChoices,
  clashFix,
  findNearestWorkingWindow,
  isAutomaticStep,
  pruneChoices,
} from './rescheduleChoices';
import {
  at,
  FIXTURE_COURTS,
  FIXTURE_GAME_ID,
  FIXTURE_OCCUPANCY,
  FIXTURE_SHARED_WITH,
  FIXTURE_WINDOW,
  fixtureReservations,
} from './courtReservationsFixtures';

const base = (): Omit<PlanRescheduleInput, 'newWindow'> => ({
  gameId: FIXTURE_GAME_ID,
  currentWindow: FIXTURE_WINDOW,
  slots: fixtureReservations('mixed').slots,
  occupancy: FIXTURE_OCCUPANCY,
  sharedWith: FIXTURE_SHARED_WITH,
  freeAlternativeCourts: FIXTURE_COURTS.map((c) => ({ courtId: c.id, name: c.name })),
});

const W = (from: string, to: string) => ({ start: at(from), end: at(to) });

describe('applyRescheduleChoices', () => {
  it('no window change → "No changes"', () => {
    const plan = planReschedule({ ...base(), newWindow: FIXTURE_WINDOW });
    expect(applyRescheduleChoices(plan, {}).footer).toEqual({ kind: 'no_changes' });
  });

  it('defaults reproduce the planner steps exactly', () => {
    const plan = planReschedule({ ...base(), newWindow: W('18:30', '20:00') });
    const effective = applyRescheduleChoices(plan, {});
    expect(effective.steps.map((s) => s.idempotencyKey)).toEqual(plan.steps.map((s) => s.idempotencyKey));
  });

  it('a pick swaps that slot\'s steps and keeps the global phase order', () => {
    const plan = planReschedule({ ...base(), newWindow: W('18:30', '20:00') });
    const target = plan.slots.find((s) => s.options.filter((o) => o.available).length >= 2)!;
    expect(target).toBeDefined();
    const alternative = target.options.find((o) => o.available && o !== target.options[0])!;
    const effective = applyRescheduleChoices(plan, { [target.slotKey]: alternative.action });
    const slot = effective.slots.find((s) => s.plan.slotKey === target.slotKey)!;
    expect(slot.chosen).toBe(alternative);
    expect(slot.overridden).toBe(true);
    expect(slot.alternatives).toContain(target.options[0]);
    for (const step of alternative.steps) expect(effective.steps).toContainEqual(step);
    const phases = effective.steps.map((s) => PLAN_STEP_PHASE[s.kind]);
    expect(phases).toEqual([...phases].sort((a, b) => a - b));
    expect(effective.steps.filter((s) => s.kind === 'save_game')).toHaveLength(1);
  });

  it('an unavailable pick falls back to the default', () => {
    const plan = planReschedule({ ...base(), newWindow: W('18:30', '20:00') });
    const effective = applyRescheduleChoices(plan, { 'gc:gc1': 'move_together' });
    expect(effective.slots[0].overridden).toBe(false);
    expect(pruneChoices(plan, { 'gc:gc1': 'move_together' })).toEqual({});
  });

  it('counts only steps the app runs itself for the footer', () => {
    const plan = planReschedule({ ...base(), newWindow: W('18:30', '20:00') });
    const effective = applyRescheduleChoices(plan, {});
    expect(effective.footer.kind).not.toBe('no_changes');
    expect(effective.steps.some((s) => !isAutomaticStep(s))).toBe(true);
  });
});

describe('clash handling', () => {
  // Court 1 is club-booked 19:30–21:00; a reported Court 3 is held by the club 19:30–20:30.
  const blockedInput = () => ({
    ...base(),
    slots: fixtureReservations('planned').slots,
    occupancy: [
      { courtId: 'c1', start: at('19:00'), end: at('21:00'), kind: 'club' as const },
      { courtId: 'c2', start: at('19:00'), end: at('21:00'), kind: 'club' as const },
      { courtId: 'c3', start: at('19:00'), end: at('21:00'), kind: 'club' as const },
      { courtId: 'c4', start: at('19:00'), end: at('21:00'), kind: 'club' as const },
      { courtId: 'c5', start: at('19:00'), end: at('21:00'), kind: 'club' as const },
    ],
  });

  it('blocks with "Resolve the clash first" and offers the nearest time that works', () => {
    const input = blockedInput();
    const plan = planReschedule({ ...input, newWindow: W('19:00', '20:30') });
    const effective = applyRescheduleChoices(plan, {});
    expect(effective.footer).toEqual({ kind: 'blocked', blockedSlotKeys: ['gc:gc1', 'gc:gc2'] });
    const nearest = findNearestWorkingWindow(input, W('19:00', '20:30'));
    expect(nearest).toEqual(W('17:30', '19:00'));
    expect(clashFix(effective.slots[0], nearest)).toEqual({ kind: 'move_time', window: W('17:30', '19:00') });
  });

  it('prefers another court over moving the time', () => {
    const input = { ...blockedInput(), occupancy: [{ courtId: 'c1', start: at('19:00'), end: at('21:00'), kind: 'club' as const }] };
    const plan = planReschedule({ ...input, newWindow: W('19:00', '20:30') });
    const effective = applyRescheduleChoices(plan, {});
    // The planner already switched Court 1 to a free court by default: not blocked.
    expect(effective.slots[0].plan.outcome).toBe('switch_court');
    expect(effective.slots[0].blocked).toBe(false);
    expect(clashFix(effective.slots[0], null)).toBeNull();
  });

  it('respects bounds when looking for a working time', () => {
    const input = blockedInput();
    const within = { startMs: Date.parse(at('18:30')), endMs: Date.parse(at('22:00')) };
    expect(findNearestWorkingWindow(input, W('19:00', '20:30'), { within })).toBeNull();
  });
});
