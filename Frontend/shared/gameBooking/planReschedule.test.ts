import { describe, expect, it } from 'vitest';
import {
  deriveCourtReservations,
  type GameCourtSlotInput,
  type ReservationLinkInput,
} from './courtReservations';
import {
  PLAN_STEP_PHASE,
  planGapFill,
  planReschedule,
  type OccupancyBlock,
  type PlanRescheduleInput,
  type PlanStep,
} from './planReschedule';

const T = (hhmm: string) => `2026-06-12T${hhmm}:00.000Z`;
const W = (from: string, to: string) => ({ start: T(from), end: T(to) });

const gc = (id: string, courtId: string, order = 0, extra: Partial<GameCourtSlotInput> = {}): GameCourtSlotInput => ({
  gameCourtId: id,
  courtId,
  order,
  reservation: 'NONE',
  ...extra,
});

const link = (id: string, extra: Partial<ReservationLinkInput> = {}): ReservationLinkInput => ({
  id,
  externalBookingId: `ext-${id}`,
  provider: 'PADELOO',
  courtId: 'c1',
  bookingStart: T('10:00'),
  bookingEnd: T('12:00'),
  ...extra,
});

function slotsFor(opts: {
  gameCourts?: GameCourtSlotInput[];
  links?: ReservationLinkInput[];
  reportedAnyCourtCount?: number;
  maxParticipants?: number;
  courtSlotCount?: number | null;
}) {
  return deriveCourtReservations({
    game: { startTime: T('10:00'), endTime: T('12:00'), maxParticipants: opts.maxParticipants ?? 4, playersPerMatch: 4 },
    gameCourts: opts.gameCourts ?? [gc('g1', 'c1')],
    reportedAnyCourtCount: opts.reportedAnyCourtCount ?? 0,
    links: opts.links ?? [],
    courtSlotCount: opts.courtSlotCount ?? null,
  }).slots;
}

function plan(partial: Partial<PlanRescheduleInput> & Pick<PlanRescheduleInput, 'slots' | 'newWindow'>) {
  return planReschedule({ gameId: 'game1', currentWindow: W('10:00', '12:00'), ...partial });
}

const block = (courtId: string, from: string, to: string, kind: OccupancyBlock['kind'] = 'club'): OccupancyBlock => ({
  courtId,
  start: T(from),
  end: T(to),
  kind,
});

const kinds = (steps: PlanStep[]) => steps.map((s) => s.kind);

describe('planReschedule — unchanged window', () => {
  it('every slot is unchanged and the only step is save_game', () => {
    const p = plan({ slots: slotsFor({ links: [link('a')] }), newWindow: W('10:00', '12:00') });
    expect(p.windowChanged).toBe(false);
    expect(p.slots[0]).toMatchObject({ outcome: 'unchanged', steps: [], notes: ['window_unchanged'] });
    expect(kinds(p.steps)).toEqual(['save_game']);
    expect(p.stepCount).toBe(1);
    expect(p.blocking).toBe(false);
  });
});

describe('planReschedule — linked, unshared', () => {
  it('keeps the booking when the new window is still covered and reports unused minutes', () => {
    const p = plan({ slots: slotsFor({ links: [link('a')] }), newWindow: W('10:30', '11:30') });
    expect(p.slots[0]).toMatchObject({ outcome: 'keep', unusedMinutes: 60, steps: [] });
    expect(p.slots[0].notes).toContain('still_covered');
  });

  it('moving to a disjoint time books the new window, saves, then cancels the old', () => {
    const p = plan({ slots: slotsFor({ links: [link('a')] }), newWindow: W('14:00', '16:00') });
    const s = p.slots[0];
    expect(s.outcome).toBe('move');
    expect(s.options.map((o) => o.action)).toEqual(['move', 'extend', 'manual']);
    expect(kinds(p.steps)).toEqual(['book', 'save_game', 'cancel']);
    expect(p.steps[0]).toMatchObject({
      kind: 'book',
      courtId: 'c1',
      provider: 'PADELOO',
      start: T('14:00'),
      end: T('16:00'),
      purpose: 'move',
      extraMinutes: 0,
      requiresVerifyBeforeRetry: true,
    });
    expect(p.steps[2]).toMatchObject({ kind: 'cancel', linkId: 'a', externalBookingId: 'ext-a' });
  });

  it('uses a manual cancel step when the provider cannot cancel', () => {
    const p = plan({
      slots: slotsFor({ links: [link('a', { provider: 'NSPADELSUPABASE' })] }),
      newWindow: W('14:00', '16:00'),
    });
    expect(kinds(p.steps)).toEqual(['book', 'save_game', 'manual_cancel']);
    expect(p.steps[0]).toMatchObject({ requiresVerifyBeforeRetry: false });
    expect(p.slots[0].notes).toContain('provider_cannot_cancel');
  });

  it('a small shift defaults to extend: the 30-min gap becomes a 60-min booking after the old one', () => {
    const p = plan({ slots: slotsFor({ links: [link('a')] }), newWindow: W('10:30', '12:30') });
    const s = p.slots[0];
    expect(s.outcome).toBe('extend');
    expect(s.notes).toEqual(expect.arrayContaining(['self_overlap_prefers_extend', 'rounded_up']));
    expect(s.extraMinutes).toBe(30);
    expect(s.unusedMinutes).toBe(30);
    expect(s.steps).toEqual([
      expect.objectContaining({ kind: 'book', start: T('12:00'), end: T('13:00'), purpose: 'extend', extraMinutes: 30 }),
    ]);
    const move = s.options.find((o) => o.action === 'move');
    expect(move).toMatchObject({ available: false, unavailableReason: 'self_overlap' });
    expect(kinds(p.steps)).toEqual(['book', 'save_game']);
  });

  it('a leading gap extends earlier, growing away from the existing booking', () => {
    const p = plan({ slots: slotsFor({ links: [link('a')] }), newWindow: W('09:30', '11:30') });
    expect(p.slots[0].steps[0]).toMatchObject({ start: T('09:00'), end: T('10:00'), extraMinutes: 30 });
  });

  it('flips the rounding direction when the rounded part hits a hard block', () => {
    const p = plan({
      slots: slotsFor({ links: [link('a', { bookingStart: T('10:00'), bookingEnd: T('11:00') }), link('b', { bookingStart: T('12:00'), bookingEnd: T('13:00') })] }),
      currentWindow: W('10:00', '13:00'),
      newWindow: W('10:00', '13:00'),
    });
    // sanity: unchanged window is a no-op even with a hole
    expect(p.slots[0].outcome).toBe('unchanged');

    const shifted = plan({
      slots: slotsFor({ links: [link('a', { bookingStart: T('11:00'), bookingEnd: T('12:00') })] }),
      newWindow: W('11:00', '12:30'),
      occupancy: [block('c1', '12:30', '13:30')],
    });
    // gap 12:00–12:30; growing later (12:00–13:00) hits the club block, growing earlier overlaps own booking
    const ext = shifted.slots[0].options.find((o) => o.action === 'extend');
    expect(ext).toMatchObject({ available: false, unavailableReason: 'clash' });
    expect(ext?.clash).toMatchObject({ courtId: 'c1', cause: 'rounding' });
  });

  it('flips rounding when the other direction is free', () => {
    const p = plan({
      slots: slotsFor({ links: [link('a', { bookingStart: T('08:00'), bookingEnd: T('09:00') })] }),
      currentWindow: W('08:00', '09:00'),
      newWindow: W('10:00', '10:30'),
      occupancy: [block('c1', '10:30', '11:30')],
    });
    const s = p.slots[0];
    expect(s.outcome).toBe('move');
    expect(s.steps[0]).toMatchObject({ kind: 'book', start: T('09:30'), end: T('10:30'), extraMinutes: 30 });
  });

  it('switches court when the new window is taken by a club booking', () => {
    const p = plan({
      slots: slotsFor({ links: [link('a')] }),
      newWindow: W('14:00', '16:00'),
      occupancy: [block('c1', '15:00', '17:00')],
      freeAlternativeCourts: [{ courtId: 'c1', name: 'Same' }, { courtId: 'c2', name: 'Court 2' }],
    });
    const s = p.slots[0];
    expect(s.outcome).toBe('switch_court');
    expect(s.clash).toMatchObject({ courtId: 'c1', cause: 'window' });
    expect(s.options[0].toCourt).toEqual({ courtId: 'c2', name: 'Court 2' });
    expect(kinds(p.steps)).toEqual(['book', 'reassign_court', 'save_game', 'cancel']);
    expect(p.steps[0]).toMatchObject({ courtId: 'c2', purpose: 'switch_court' });
    expect(p.steps[1]).toMatchObject({ gameCourtId: 'g1', fromCourtId: 'c1', toCourtId: 'c2' });
  });

  it('skips alternative courts that are themselves blocked', () => {
    const p = plan({
      slots: slotsFor({ links: [link('a')] }),
      newWindow: W('14:00', '16:00'),
      occupancy: [block('c1', '14:00', '15:00', 'hold'), block('c2', '15:00', '16:00', 'app_game_reserved')],
      freeAlternativeCourts: [{ courtId: 'c2', name: 'Court 2' }, { courtId: 'c3', name: 'Court 3' }],
    });
    expect(p.slots[0].options[0].toCourt?.courtId).toBe('c3');
  });

  it('prefers a court with no planned game over one that would only warn', () => {
    const p = plan({
      slots: slotsFor({ links: [link('a')] }),
      newWindow: W('14:00', '16:00'),
      occupancy: [block('c1', '15:00', '17:00'), block('c2', '15:00', '16:00', 'app_game_planned')],
      freeAlternativeCourts: [{ courtId: 'c2', name: 'Court 2' }, { courtId: 'c3', name: 'Court 3' }],
    });
    expect(p.slots[0].options[0].toCourt?.courtId).toBe('c3');
    expect(p.slots[0].warnings).toEqual([]);
    expect(p.slots[0].notes).not.toContain('soft_conflict');
  });

  it('still uses a softly busy court when it is the only one left', () => {
    const p = plan({
      slots: slotsFor({ links: [link('a')] }),
      newWindow: W('14:00', '16:00'),
      occupancy: [block('c1', '15:00', '17:00'), block('c2', '15:00', '16:00', 'app_game_planned')],
      freeAlternativeCourts: [{ courtId: 'c2', name: 'Court 2' }],
    });
    expect(p.slots[0].options[0].toCourt?.courtId).toBe('c2');
    expect(p.slots[0].notes).toContain('soft_conflict');
  });

  it('is blocked when no alternative court exists', () => {
    const p = plan({
      slots: slotsFor({ links: [link('a')] }),
      newWindow: W('14:00', '16:00'),
      occupancy: [block('c1', '14:00', '15:00')],
    });
    expect(p.blocking).toBe(true);
    expect(p.slots[0]).toMatchObject({ outcome: 'blocked', steps: [] });
    expect(p.slots[0].notes).toEqual(expect.arrayContaining(['clash', 'no_alternative_court']));
    expect(p.slots[0].options.map((o) => o.action)).toContain('manual');
    expect(kinds(p.steps)).toEqual(['save_game']);
    expect(p.summaryCounts.blocked).toBe(1);
  });

  it('a planned app game is only a soft warning', () => {
    const p = plan({
      slots: slotsFor({ links: [link('a')] }),
      newWindow: W('14:00', '16:00'),
      occupancy: [block('c1', '14:00', '15:00', 'app_game_planned')],
    });
    expect(p.slots[0].outcome).toBe('move');
    expect(p.slots[0].warnings).toHaveLength(1);
    expect(p.slots[0].notes).toContain('soft_conflict');
    expect(p.blocking).toBe(false);
  });

  it('falls back to manual when the provider is unknown', () => {
    const p = plan({ slots: slotsFor({ links: [link('a', { provider: 'MYSTERY' })] }), newWindow: W('14:00', '16:00') });
    expect(p.slots[0].outcome).toBe('manual');
    expect(p.slots[0].steps[0]).toMatchObject({ kind: 'manual_club', reason: 'cannot_book', start: T('14:00'), end: T('16:00') });
  });

  it('caller overrides change provider capabilities', () => {
    const p = plan({
      slots: slotsFor({ links: [link('a', { provider: 'BOOKTIME' })] }),
      newWindow: W('14:00', '15:30'),
      providerCapabilities: { BOOKTIME: { durationsMinutes: [60, 90] } },
    });
    expect(p.slots[0].steps[0]).toMatchObject({ start: T('14:00'), end: T('15:30'), extraMinutes: 0 });
    const def = plan({ slots: slotsFor({ links: [link('a', { provider: 'BOOKTIME' })] }), newWindow: W('14:00', '15:30') });
    expect(def.slots[0].steps[0]).toMatchObject({ start: T('14:00'), end: T('16:00'), extraMinutes: 30 });
  });

  it('a link with unknown times needs the club', () => {
    const p = plan({
      slots: slotsFor({ links: [link('a', { bookingStart: null, bookingEnd: null })] }),
      newWindow: W('14:00', '16:00'),
    });
    expect(p.slots[0]).toMatchObject({ outcome: 'manual' });
    expect(p.slots[0].steps[0]).toMatchObject({ kind: 'manual_club', reason: 'unknown_time' });
  });

  it('an any-court linked slot without a court cannot be booked automatically', () => {
    const p = plan({
      slots: slotsFor({ gameCourts: [], links: [link('a', { courtId: null })] }),
      newWindow: W('14:00', '16:00'),
    });
    expect(p.slots[0].outcome).toBe('manual');
    expect(p.slots[0].steps[0]).toMatchObject({ reason: 'no_court' });
  });
});

describe('planReschedule — linked, shared', () => {
  const sharedWith = {
    a: [{ gameId: 'other', name: 'Evening match', start: T('10:00'), end: T('12:00'), canEdit: true }],
  };

  it('never cancels; defaults to extend with unlink and move_together alternatives', () => {
    const p = plan({ slots: slotsFor({ links: [link('a')] }), newWindow: W('10:30', '12:30'), sharedWith });
    const s = p.slots[0];
    expect(s.outcome).toBe('extend');
    expect(s.notes).toContain('shared_never_cancelled');
    expect(s.options.map((o) => o.action)).toEqual(['extend', 'move_together', 'unlink', 'manual']);
    expect(p.steps.some((st) => st.kind === 'cancel' || st.kind === 'manual_cancel')).toBe(false);
  });

  it('looks sharers up by externalBookingId too', () => {
    const p = plan({
      slots: slotsFor({ links: [link('a')] }),
      newWindow: W('14:00', '16:00'),
      sharedWith: { 'ext-a': sharedWith.a },
    });
    expect(p.slots[0].outcome).toBe('extend');
    expect(kinds(p.steps)).toEqual(['book', 'save_game']);
  });

  it('move_together shifts the other games and cancels the old reservation once nobody needs it', () => {
    const p = plan({ slots: slotsFor({ links: [link('a')] }), newWindow: W('14:00', '16:00'), sharedWith });
    const mt = p.slots[0].options.find((o) => o.action === 'move_together');
    expect(mt).toMatchObject({ available: true, movesGames: [{ gameId: 'other', name: 'Evening match' }] });
    expect(kinds(mt!.steps)).toEqual(['book', 'move_shared_game', 'cancel']);
    expect(mt!.steps[1]).toMatchObject({ gameId: 'other', start: T('14:00'), end: T('16:00') });
  });

  it('move_together is unavailable when a sharer is not editable', () => {
    const p = plan({
      slots: slotsFor({ links: [link('a')] }),
      newWindow: W('14:00', '16:00'),
      sharedWith: { a: [{ ...sharedWith.a[0], canEdit: false }] },
    });
    expect(p.slots[0].options.find((o) => o.action === 'move_together')).toMatchObject({
      available: false,
      unavailableReason: 'sharer_not_editable',
    });
  });

  it('switching court on a shared slot unlinks instead of cancelling', () => {
    const p = plan({
      slots: slotsFor({ links: [link('a')] }),
      newWindow: W('14:00', '16:00'),
      sharedWith,
      occupancy: [block('c1', '14:00', '16:00')],
      freeAlternativeCourts: [{ courtId: 'c2', name: 'Court 2' }],
    });
    expect(p.slots[0].outcome).toBe('switch_court');
    expect(kinds(p.steps)).toEqual(['book', 'reassign_court', 'save_game', 'unlink']);
  });
});

describe('planReschedule — planned and reported slots', () => {
  it('a planned slot without clashes is unchanged', () => {
    const p = plan({ slots: slotsFor({}), newWindow: W('14:00', '16:00') });
    expect(p.slots[0]).toMatchObject({ outcome: 'unchanged', steps: [] });
  });

  it('a planned slot whose court is taken switches court or blocks', () => {
    const occupancy = [block('c1', '14:00', '16:00')];
    const switched = plan({
      slots: slotsFor({}),
      newWindow: W('14:00', '16:00'),
      occupancy,
      freeAlternativeCourts: [{ courtId: 'c2', name: 'Court 2' }],
    });
    expect(switched.slots[0].outcome).toBe('switch_court');
    expect(kinds(switched.steps)).toEqual(['reassign_court', 'save_game']);
    const blocked = plan({ slots: slotsFor({}), newWindow: W('14:00', '16:00'), occupancy });
    expect(blocked.slots[0].outcome).toBe('blocked');
  });

  it('two clashing slots do not take the same alternative court', () => {
    const p = plan({
      slots: slotsFor({ gameCourts: [gc('g1', 'c1', 0), gc('g2', 'c2', 1)], maxParticipants: 8 }),
      newWindow: W('14:00', '16:00'),
      occupancy: [block('c1', '14:00', '16:00'), block('c2', '14:00', '16:00')],
      freeAlternativeCourts: [{ courtId: 'c3', name: 'Court 3' }],
    });
    expect(p.slots.map((s) => s.outcome)).toEqual(['switch_court', 'blocked']);
  });

  it('a reported slot is kept when the new window sits inside the old one', () => {
    const p = plan({ slots: slotsFor({ gameCourts: [gc('g1', 'c1', 0, { reservation: 'REPORTED' })] }), newWindow: W('10:00', '11:00') });
    expect(p.slots[0]).toMatchObject({ outcome: 'keep', unusedMinutes: 60 });
  });

  it('a reported slot otherwise needs the club', () => {
    const p = plan({ slots: slotsFor({ gameCourts: [gc('g1', 'c1', 0, { reservation: 'REPORTED' })] }), newWindow: W('11:00', '13:00') });
    expect(p.slots[0].outcome).toBe('manual');
    expect(p.slots[0].notes).toContain('tell_the_club');
    expect(kinds(p.steps)).toEqual(['save_game', 'manual_club']);
  });
});

describe('planReschedule — global ordering and idempotency', () => {
  const input = (): PlanRescheduleInput => ({
    gameId: 'game1',
    currentWindow: W('10:00', '12:00'),
    newWindow: W('14:00', '16:00'),
    slots: slotsFor({
      gameCourts: [gc('g1', 'c1', 0), gc('g2', 'c2', 1, { reservation: 'REPORTED' })],
      maxParticipants: 12,
      courtSlotCount: 3,
      links: [link('a'), link('b', { courtId: 'c9', provider: 'KLIKTEREN' })],
    }),
  });

  it('orders bookings, then save_game, then cancellations', () => {
    const p = planReschedule(input());
    const phases = p.steps.map((s) => PLAN_STEP_PHASE[s.kind]);
    expect([...phases].sort((a, b) => a - b)).toEqual(phases);
    expect(kinds(p.steps)).toEqual(['book', 'book', 'save_game', 'cancel', 'manual_club', 'cancel']);
    expect(p.stepCount).toBe(6);
    expect(p.summaryCounts).toEqual({ unchanged: 0, keep: 0, move: 2, extend: 0, switch_court: 0, blocked: 0, manual: 1 });
  });

  it('is deterministic and idempotency keys are stable and unique', () => {
    const a = planReschedule(input());
    const b = planReschedule({ ...input(), slots: [...input().slots].reverse() });
    expect(b).toEqual(a);
    const keys = a.steps.map((s) => s.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe(`reschedule:game1:gc:g1:book_move:c1:${Date.parse(T('14:00'))}-${Date.parse(T('16:00'))}`);
    expect(keys).toContain(`reschedule:game1:game:save_game:${Date.parse(T('14:00'))}-${Date.parse(T('16:00'))}`);
  });

  it('a different target window produces different booking keys', () => {
    const a = planReschedule(input());
    const b = planReschedule({ ...input(), newWindow: W('15:00', '17:00') });
    expect(a.steps[0].idempotencyKey).not.toBe(b.steps[0].idempotencyKey);
  });

  it('an invalid new window blocks every slot', () => {
    const p = planReschedule({ ...input(), newWindow: { start: T('12:00'), end: T('11:00') } });
    expect(p.blocking).toBe(true);
    expect(p.steps).toEqual([]);
    expect(p.slots.every((s) => s.outcome === 'blocked' && s.notes[0] === 'invalid_window')).toBe(true);
  });
});

describe('planGapFill', () => {
  const bt = (from: string, to: string, id = 'a') =>
    link(id, { provider: 'BOOKTIME', courtId: 'c1', gameCourtId: 'g1', bookingStart: T(from), bookingEnd: T(to) });
  const slotWith = (links: ReservationLinkInput[]) => slotsFor({ links })[0];

  it('a gap at the start grows EARLIER, never over the game\'s own booking', () => {
    const r = planGapFill({ slot: slotWith([bt('10:30', '12:00')]), window: W('10:00', '12:00') });
    expect(r.unavailableReason).toBeUndefined();
    expect(r.gaps).toEqual([W('10:00', '10:30')]);
    expect(r.bookings).toEqual([{ courtId: 'c1', start: T('09:30'), end: T('10:30'), extraMinutes: 30 }]);
    expect(r.extraMinutes).toBe(30);
  });

  it('a gap at the end grows later', () => {
    const r = planGapFill({ slot: slotWith([bt('10:00', '11:30')]), window: W('10:00', '12:00') });
    expect(r.bookings).toEqual([{ courtId: 'c1', start: T('11:30'), end: T('12:30'), extraMinutes: 30 }]);
  });

  it('tries the other direction when a hard block is in the way', () => {
    const slot = slotsFor({ links: [] })[0];
    const r = planGapFill({
      slot,
      window: W('10:00', '11:30'),
      provider: 'BOOKTIME',
      blocks: [block('c1', '11:45', '12:30')],
    });
    expect(r.flipped).toBe(true);
    expect(r.bookings).toEqual([{ courtId: 'c1', start: T('09:30'), end: T('11:30'), extraMinutes: 30 }]);
  });

  it('a planned app game does not block', () => {
    const r = planGapFill({
      slot: slotWith([bt('10:00', '11:30')]),
      window: W('10:00', '12:00'),
      blocks: [block('c1', '12:00', '13:00', 'app_game_planned')],
    });
    expect(r.bookings).toHaveLength(1);
  });

  it('both directions blocked → clash with the blocks', () => {
    const r = planGapFill({
      slot: slotWith([bt('10:30', '12:00')]),
      window: W('10:00', '12:00'),
      blocks: [block('c1', '09:00', '10:00')],
    });
    expect(r.bookings).toEqual([]);
    expect(r.unavailableReason).toBe('clash');
    expect(r.clash?.blocks.map((b) => b.start)).toEqual([T('09:00')]);
  });

  it('splits a long gap into allowed lengths, back to back', () => {
    const r = planGapFill({ slot: slotWith([bt('10:00', '10:30')]), window: W('10:00', '13:00') });
    expect(r.bookings.length).toBe(2);
    expect(r.bookings[0].start).toBe(T('10:30'));
    expect(r.bookings[0].end).toBe(r.bookings[1].start);
    expect(r.extraMinutes).toBe(30);
  });

  it('fills every gap around a booking in the middle', () => {
    const r = planGapFill({ slot: slotWith([bt('10:30', '11:30')]), window: W('10:00', '12:00') });
    expect(r.bookings).toEqual([
      { courtId: 'c1', start: T('09:30'), end: T('10:30'), extraMinutes: 30 },
      { courtId: 'c1', start: T('11:30'), end: T('12:30'), extraMinutes: 30 },
    ]);
  });

  it('explains why nothing can be planned', () => {
    expect(planGapFill({ slot: slotWith([bt('10:00', '12:00')]), window: W('10:00', '12:00') }).unavailableReason).toBe('no_gap');
    const anyCourt = slotsFor({ gameCourts: [], courtSlotCount: 1, links: [] })[0];
    expect(planGapFill({ slot: anyCourt, window: W('10:00', '12:00'), provider: 'BOOKTIME' }).unavailableReason).toBe('no_court');
    expect(
      planGapFill({ slot: slotWith([bt('10:00', '11:30')]), window: W('10:00', '12:00'), capabilities: { BOOKTIME: { canBook: false } } })
        .unavailableReason,
    ).toBe('cannot_book');
    expect(planGapFill({ slot: { ...slotWith([bt('10:00', '11:30')]), unknownTime: true }, window: W('10:00', '12:00') }).unavailableReason).toBe(
      'unknown_time',
    );
    expect(planGapFill({ slot: slotWith([]), window: { start: 'x', end: 'y' } }).unavailableReason).toBe('invalid_window');
  });
});
