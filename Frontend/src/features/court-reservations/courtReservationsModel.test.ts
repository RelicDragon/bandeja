import { describe, expect, it } from 'vitest';
import { deriveCourtReservations, type GameCourtSlotInput } from '@shared/gameBooking/courtReservations';
import {
  buildCourtSlotsBody,
  courtCountBounds,
  courtPickMode,
  courtsPrimaryAction,
  hourTicks,
  paddedTimelineRange,
  reportedAnyCourtCountOf,
  slotCoverageSegments,
  slotSheetActions,
  timelinePercent,
} from './courtReservationsModel';
import { at, fixtureReservations, FIXTURE_WINDOW } from './courtReservationsFixtures';

describe('courtsPrimaryAction', () => {
  it('asks to reserve every court when nothing is held', () => {
    expect(courtsPrimaryAction(fixtureReservations('planned'), { canEdit: true })).toEqual({
      kind: 'reserve',
      count: 2,
      remaining: false,
      slotKeys: ['gc:gc1', 'gc:gc2'],
    });
  });

  it('asks for the remaining courts before any gap', () => {
    const action = courtsPrimaryAction(fixtureReservations('mixed'), { canEdit: true });
    expect(action).toMatchObject({ kind: 'reserve', count: 1, remaining: true, slotKeys: ['any:0'] });
  });

  it('offers to fill the earliest gap when every court is held', () => {
    expect(courtsPrimaryAction(fixtureReservations('gap'), { canEdit: true })).toEqual({
      kind: 'fill_gap',
      slotKey: 'gc:gc3',
      gap: { start: at('19:00'), end: at('19:30') },
      minutes: 30,
      gapCount: 1,
    });
  });

  it('has nothing to do when all courts are reserved, or for a non-organizer', () => {
    expect(courtsPrimaryAction(fixtureReservations('reserved'), { canEdit: true })).toBeNull();
    expect(courtsPrimaryAction(fixtureReservations('planned'), { canEdit: false })).toBeNull();
  });
});

describe('slotSheetActions', () => {
  const ctx = { canEdit: true, canBookHere: true, shared: false, canVerify: (p: string) => p === 'BOOKTIME' };
  const slots = fixtureReservations('mixed').slots;
  const kinds = (list: { kind: string }[]) => list.map((a) => a.kind);

  it('planned: reserve now (primary) · link · mark as reserved', () => {
    const actions = slotSheetActions(slots[3], ctx);
    expect(kinds(actions)).toEqual(['reserve', 'link', 'mark_reserved']);
    expect(actions[0].primary).toBe(true);
  });

  it('planned without a bookable integration: linking becomes the primary action', () => {
    const actions = slotSheetActions(slots[3], { ...ctx, canBookHere: false });
    expect(kinds(actions)).toEqual(['link', 'mark_reserved']);
    expect(actions[0].primary).toBe(true);
  });

  it('reported: link · mark not reserved (destructive)', () => {
    const actions = slotSheetActions(slots[2], ctx);
    expect(kinds(actions)).toEqual(['link', 'mark_not_reserved']);
    expect(actions[1].destructive).toBe(true);
  });

  it('linked: verify · unlink · cancel at the club when the provider can cancel and nobody shares it', () => {
    expect(kinds(slotSheetActions(slots[0], ctx))).toEqual(['verify', 'unlink', 'cancel_at_club']);
    expect(kinds(slotSheetActions(slots[0], { ...ctx, shared: true }))).toEqual(['verify', 'unlink']);
  });

  it('never more than three, and nothing for a non-organizer', () => {
    for (const slot of slots) expect(slotSheetActions(slot, ctx).length).toBeLessThanOrEqual(3);
    expect(slotSheetActions(slots[0], { ...ctx, canEdit: false })).toEqual([]);
  });

  it('Weltner (cannot cancel via API) never offers cancel', () => {
    const slot = { ...slots[0], provider: 'WELTNER', links: slots[0].links.map((l) => ({ ...l, provider: 'WELTNER' })) };
    expect(kinds(slotSheetActions(slot, { ...ctx, canVerify: () => false }))).toEqual(['unlink']);
  });
});

describe('buildCourtSlotsBody', () => {
  const gameCourts: GameCourtSlotInput[] = [
    { gameCourtId: 'gc1', courtId: 'c1', order: 1, reservation: 'NONE' },
    { gameCourtId: 'gc2', courtId: 'c2', order: 2, reservation: 'REPORTED' },
  ];
  const state = { gameCourts, reportedAnyCourtCount: 1 };

  it('marks an assigned slot reserved / not reserved in place', () => {
    expect(buildCourtSlotsBody(state, { kind: 'mark_reserved', slot: { gameCourtId: 'gc1', courtId: 'c1' } })).toEqual({
      slots: [
        { courtId: 'c1', reservation: 'REPORTED' },
        { courtId: 'c2', reservation: 'REPORTED' },
      ],
      reportedAnyCourtCount: 1,
    });
    expect(
      buildCourtSlotsBody(state, { kind: 'mark_not_reserved', slot: { gameCourtId: 'gc2', courtId: 'c2' } }).slots[1],
    ).toEqual({ courtId: 'c2', reservation: 'NONE' });
  });

  it('an any-court slot is counted, or becomes a court when one is picked', () => {
    const any = { gameCourtId: null, courtId: null };
    expect(buildCourtSlotsBody(state, { kind: 'mark_reserved', slot: any }).reportedAnyCourtCount).toBe(2);
    expect(buildCourtSlotsBody(state, { kind: 'mark_not_reserved', slot: any }).reportedAnyCourtCount).toBe(0);
    const picked = buildCourtSlotsBody(state, { kind: 'mark_reserved', slot: any, courtId: 'c4' });
    expect(picked.slots[2]).toEqual({ courtId: 'c4', reservation: 'REPORTED' });
    expect(buildCourtSlotsBody(state, { kind: 'assign_court', slot: any, courtId: 'c5' }).slots[2]).toEqual({
      courtId: 'c5',
      reservation: 'NONE',
    });
  });

  it('a synthetic legacy slot is sent as its court', () => {
    const legacy = { gameCourts: [{ gameCourtId: 'legacy:c1', courtId: 'c1', order: 0, reservation: 'NONE' as const }], reportedAnyCourtCount: 0 };
    expect(
      buildCourtSlotsBody(legacy, { kind: 'mark_reserved', slot: { gameCourtId: 'legacy:c1', courtId: 'c1' } }).slots,
    ).toEqual([{ courtId: 'c1', reservation: 'REPORTED' }]);
  });

  it('reassigns a court (new court starts unreserved; merging into an existing court drops the old one)', () => {
    expect(buildCourtSlotsBody(state, { kind: 'reassign_court', fromCourtId: 'c2', toCourtId: 'c5' }).slots).toEqual([
      { courtId: 'c1', reservation: 'NONE' },
      { courtId: 'c5', reservation: 'NONE' },
    ]);
    expect(buildCourtSlotsBody(state, { kind: 'reassign_court', fromCourtId: 'c2', toCourtId: 'c1' }).slots).toEqual([
      { courtId: 'c1', reservation: 'NONE' },
    ]);
  });

  it('sets the number of courts, never below the assigned ones, and keeps reports within it', () => {
    expect(buildCourtSlotsBody(state, { kind: 'set_count', count: 4 })).toMatchObject({ courtSlotCount: 4, reportedAnyCourtCount: 1 });
    expect(buildCourtSlotsBody(state, { kind: 'set_count', count: 1 })).toMatchObject({ courtSlotCount: 2, reportedAnyCourtCount: 0 });
    expect(buildCourtSlotsBody({ ...state, courtSlotCount: 3 }, { kind: 'mark_reserved', slot: { gameCourtId: 'gc1', courtId: 'c1' } }))
      .toMatchObject({ courtSlotCount: 3 });
    expect(courtCountBounds(0)).toEqual({ min: 1, max: 16 });
    expect(courtCountBounds(3)).toEqual({ min: 3, max: 16 });
    expect(courtCountBounds(0, 1)).toEqual({ min: 1, max: 1 });
    expect(courtCountBounds(2, 1)).toEqual({ min: 2, max: 2 });
  });

  it('reportedAnyCourtCountOf counts reported any-court slots only', () => {
    const result = deriveCourtReservations({
      game: { startTime: at('18:00'), endTime: at('19:30'), maxParticipants: 12, playersPerMatch: 4 },
      gameCourts: [{ gameCourtId: 'gc1', courtId: 'c1', order: 1, reservation: 'REPORTED' }],
      courtSlotCount: 3,
      reportedAnyCourtCount: 1,
      links: [],
    });
    expect(reportedAnyCourtCountOf(result.slots)).toBe(1);
  });
});

describe('timeline geometry', () => {
  const range = { startMs: Date.parse(at('17:00')), endMs: Date.parse(at('21:00')) };

  it('places intervals as clipped percentages', () => {
    expect(timelinePercent(FIXTURE_WINDOW, range)).toEqual({ offset: 25, width: 37.5 });
    expect(timelinePercent({ start: at('16:00'), end: at('17:30') }, range)).toEqual({ offset: 0, width: 12.5 });
    expect(timelinePercent({ start: at('21:00'), end: at('22:00') }, range)).toBeNull();
  });

  it('pads to half hours and ticks on local hours of the club', () => {
    expect(paddedTimelineRange([FIXTURE_WINDOW], 45)).toEqual({
      startMs: Date.parse(at('17:00')),
      endMs: Date.parse(at('20:30')),
    });
    // Kolkata is UTC+05:30: local full hours fall on UTC half hours.
    const ticks = hourTicks({ startMs: Date.parse('2026-10-08T12:00:00Z'), endMs: Date.parse('2026-10-08T14:00:00Z') }, 'Asia/Kolkata');
    expect(ticks.map((ms) => new Date(ms).toISOString())).toEqual(['2026-10-08T12:30:00.000Z', '2026-10-08T13:30:00.000Z']);
  });

  it('coverage segments: reported = whole window, linked = links + gaps, planned = nothing', () => {
    const [linked, gapped, reported, planned] = fixtureReservations('mixed').slots;
    expect(slotCoverageSegments(reported, FIXTURE_WINDOW)).toEqual({ reserved: [FIXTURE_WINDOW], gaps: [] });
    expect(slotCoverageSegments(planned, FIXTURE_WINDOW)).toEqual({ reserved: [], gaps: [] });
    expect(slotCoverageSegments(linked, FIXTURE_WINDOW).reserved).toEqual([FIXTURE_WINDOW]);
    expect(slotCoverageSegments(gapped, FIXTURE_WINDOW).gaps).toEqual([{ start: at('19:00'), end: at('19:30') }]);
  });
});

describe('courtPickMode', () => {
  const ctx = { canEdit: true, canAssignCourt: true, pickableCourtIds: ['c4', 'c5'] };
  it('"Any court" (planned or reported) can just take a court', () => {
    expect(courtPickMode({ state: 'planned', courtId: null }, ctx)).toBe('assign');
    expect(courtPickMode({ state: 'reported', courtId: null }, ctx)).toBe('assign');
  });
  it('a planned slot with a court can change it; reserved ones cannot', () => {
    expect(courtPickMode({ state: 'planned', courtId: 'c1' }, ctx)).toBe('change');
    expect(courtPickMode({ state: 'reported', courtId: 'c1' }, ctx)).toBe('none');
    expect(courtPickMode({ state: 'linked', courtId: 'c1' }, ctx)).toBe('none');
    expect(courtPickMode({ state: 'linked', courtId: null }, ctx)).toBe('none');
  });
  it('opt-in, organizers only, and only when another court is free', () => {
    expect(courtPickMode({ state: 'planned', courtId: null }, { ...ctx, canAssignCourt: false })).toBe('none');
    expect(courtPickMode({ state: 'planned', courtId: null }, { ...ctx, canEdit: false })).toBe('none');
    expect(courtPickMode({ state: 'planned', courtId: 'c4' }, { ...ctx, pickableCourtIds: ['c4'] })).toBe('none');
  });
});
