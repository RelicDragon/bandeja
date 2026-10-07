import { describe, expect, it } from 'vitest';
import {
  computeRequiredCourtSlotCount,
  defaultCourtSlotCount,
  deriveCourtReservations,
  summarizeCourtSlots,
  type DeriveCourtReservationsInput,
  type GameCourtSlotInput,
  type ReservationLinkInput,
} from './courtReservations';

const T = (hhmm: string) => `2026-06-12T${hhmm}:00.000Z`;

const game = {
  startTime: T('10:00'),
  endTime: T('12:00'),
  maxParticipants: 4,
  playersPerMatch: 4,
};

const gc = (id: string, courtId: string, order: number, extra: Partial<GameCourtSlotInput> = {}): GameCourtSlotInput => ({
  gameCourtId: id,
  courtId,
  order,
  reservation: 'NONE',
  ...extra,
});

const link = (id: string, extra: Partial<ReservationLinkInput> = {}): ReservationLinkInput => ({
  id,
  externalBookingId: `ext-${id}`,
  provider: 'BOOKTIME',
  bookingStart: T('10:00'),
  bookingEnd: T('12:00'),
  ...extra,
});

const derive = (partial: Partial<DeriveCourtReservationsInput>) =>
  deriveCourtReservations({ game, gameCourts: [], reportedAnyCourtCount: 0, links: [], ...partial });

describe('computeRequiredCourtSlotCount', () => {
  it('default: assigned courts when any, else the roster need, never below 1', () => {
    expect(computeRequiredCourtSlotCount({ maxParticipants: 8, playersPerMatch: 4 }, 0)).toBe(2);
    expect(computeRequiredCourtSlotCount({ maxParticipants: 8, playersPerMatch: 4 }, 1)).toBe(1);
    expect(computeRequiredCourtSlotCount({ maxParticipants: 8, playersPerMatch: 4 }, 3)).toBe(3);
    expect(computeRequiredCourtSlotCount({ maxParticipants: 4, playersPerMatch: 2 }, 0)).toBe(2);
    expect(computeRequiredCourtSlotCount({ maxParticipants: 0, playersPerMatch: 4 }, 0)).toBe(1);
    expect(computeRequiredCourtSlotCount({ maxParticipants: Number.NaN, playersPerMatch: null }, 0)).toBe(1);
  });

  it('explicit courtSlotCount wins over the roster, but never below the assigned courts', () => {
    expect(computeRequiredCourtSlotCount({ maxParticipants: 8, playersPerMatch: 4 }, 0, 1)).toBe(1);
    expect(computeRequiredCourtSlotCount({ maxParticipants: 4, playersPerMatch: 4 }, 0, 3)).toBe(3);
    expect(computeRequiredCourtSlotCount({ maxParticipants: 16, playersPerMatch: 4 }, 2, 4)).toBe(4);
    expect(computeRequiredCourtSlotCount({ maxParticipants: 16, playersPerMatch: 4 }, 3, 2)).toBe(3);
  });

  it('ignores invalid courtSlotCount values (legacy default)', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, null, undefined]) {
      expect(computeRequiredCourtSlotCount({ maxParticipants: 8, playersPerMatch: 4 }, 0, bad)).toBe(2);
    }
  });
});

describe('defaultCourtSlotCount', () => {
  it('is the roster need, at least 1', () => {
    expect(defaultCourtSlotCount({ maxParticipants: 16, playersPerMatch: 4 })).toBe(4);
    expect(defaultCourtSlotCount({ maxParticipants: 8, playersPerMatch: 4 })).toBe(2);
    expect(defaultCourtSlotCount({ maxParticipants: 6, playersPerMatch: 2 })).toBe(3);
    expect(defaultCourtSlotCount({ maxParticipants: 0, playersPerMatch: 4 })).toBe(1);
  });
});

describe('deriveCourtReservations — slot count', () => {
  it('8 players, the organizer chose one court and linked it → reserved', () => {
    const r = derive({
      game: { ...game, maxParticipants: 8 },
      gameCourts: [gc('g1', 'c1', 0)],
      links: [link('a', { courtId: 'c1' })],
    });
    expect(r.slots.map((s) => s.key)).toEqual(['gc:g1']);
    expect(r.summary).toEqual({ kind: 'reserved', reserved: 1, total: 1, gapCount: 0 });
    expect(r.legacy).toEqual({ bookingStatus: 'EXTERNAL_FULL', hasBookedCourt: true });
  });

  it('16 players and no courts → 4 any-court slots', () => {
    const r = derive({ game: { ...game, maxParticipants: 16 } });
    expect(r.slots.map((s) => s.key)).toEqual(['any:0', 'any:1', 'any:2', 'any:3']);
    expect(r.summary).toEqual({ kind: 'planned', reserved: 0, total: 4, gapCount: 0 });
  });

  it('explicit 4 with 2 assigned → 2 any-court slots', () => {
    const r = derive({
      game: { ...game, maxParticipants: 8 },
      gameCourts: [gc('g1', 'c1', 0), gc('g2', 'c2', 1)],
      courtSlotCount: 4,
    });
    expect(r.slots.map((s) => s.key)).toEqual(['gc:g1', 'gc:g2', 'any:0', 'any:1']);
  });

  it('explicit count smaller than the assigned courts → assigned wins', () => {
    const r = derive({
      game: { ...game, maxParticipants: 16 },
      gameCourts: [gc('g1', 'c1', 0), gc('g2', 'c2', 1), gc('g3', 'c3', 2)],
      courtSlotCount: 1,
    });
    expect(r.slots.map((s) => s.key)).toEqual(['gc:g1', 'gc:g2', 'gc:g3']);
  });

  it('explicit 1 for 8 players with no courts → one any-court slot', () => {
    const r = derive({ game: { ...game, maxParticipants: 8 }, courtSlotCount: 1, links: [link('a', { courtId: 'c1' })] });
    expect(r.slots).toHaveLength(1);
    expect(r.legacy.bookingStatus).toBe('EXTERNAL_FULL');
  });
});

describe('deriveCourtReservations — extra courts', () => {
  it('two linked courts for a 4-player game → one extra (prod 2026-10-07)', () => {
    const r = derive({
      game: { ...game, maxParticipants: 4 },
      gameCourts: [gc('g1', 'c1', 0), gc('g4', 'c4', 1)],
      links: [link('a', { courtId: 'c1' }), link('b', { courtId: 'c4' })],
    });
    expect(r.extraCourts).toBe(1);
    expect(r.legacy.bookingStatus).toBe('EXTERNAL_FULL');
  });

  it('an empty extra court and courts the organizer asked for are not extra', () => {
    expect(
      derive({ game: { ...game, maxParticipants: 4 }, gameCourts: [gc('g1', 'c1', 0), gc('g2', 'c2', 1)], links: [link('a', { courtId: 'c1' })] })
        .extraCourts,
    ).toBe(0);
    expect(
      derive({
        game: { ...game, maxParticipants: 4 },
        gameCourts: [gc('g1', 'c1', 0), gc('g2', 'c2', 1)],
        links: [link('a', { courtId: 'c1' }), link('b', { courtId: 'c2' })],
        courtSlotCount: 2,
      }).extraCourts,
    ).toBe(0);
  });
});

describe('deriveCourtReservations — slots', () => {
  it('a fresh game is one planned any-court slot', () => {
    const r = derive({});
    expect(r.slots).toHaveLength(1);
    expect(r.slots[0]).toMatchObject({
      key: 'any:0',
      order: 0,
      courtId: null,
      gameCourtId: null,
      state: 'planned',
      gaps: [],
      unknownTime: false,
      coverage: { coveredMinutes: 0, totalMinutes: 120 },
    });
    expect(r.summary).toEqual({ kind: 'planned', reserved: 0, total: 1, gapCount: 0 });
    expect(r.legacy).toEqual({ bookingStatus: 'NONE', hasBookedCourt: false });
  });

  it('orders assigned courts by order then fills any-court slots', () => {
    const r = derive({
      game: { ...game, maxParticipants: 12 },
      gameCourts: [gc('g2', 'c2', 2), gc('g1', 'c1', 1)],
      courtSlotCount: 3,
    });
    expect(r.slots.map((s) => s.key)).toEqual(['gc:g1', 'gc:g2', 'any:0']);
    expect(r.slots.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it('reported assigned court covers the window', () => {
    const r = derive({ gameCourts: [gc('g1', 'c1', 0, { reservation: 'REPORTED', reportedById: 'u1', reportedAt: T('08:00') })] });
    expect(r.slots[0]).toMatchObject({
      state: 'reported',
      reportedById: 'u1',
      reportedAt: T('08:00'),
      gaps: [],
      coverage: { coveredMinutes: 120, totalMinutes: 120 },
    });
    expect(r.summary.kind).toBe('reserved');
    expect(r.legacy).toEqual({ bookingStatus: 'MANUAL', hasBookedCourt: true });
  });

  it('reportedAnyCourtCount marks unassigned slots as reported', () => {
    const r = derive({
      game: { ...game, maxParticipants: 12 },
      gameCourts: [gc('g1', 'c1', 0)],
      courtSlotCount: 3,
      reportedAnyCourtCount: 1,
    });
    expect(r.slots.map((s) => s.state)).toEqual(['planned', 'reported', 'planned']);
    expect(r.summary).toEqual({ kind: 'partial', reserved: 1, total: 3, gapCount: 0 });
    expect(r.legacy.bookingStatus).toBe('MANUAL');
  });

  it('clamps reportedAnyCourtCount to the any-court slots available', () => {
    const r = derive({ gameCourts: [gc('g1', 'c1', 0)], reportedAnyCourtCount: 5 });
    expect(r.slots.map((s) => s.state)).toEqual(['planned']);
    const neg = derive({ reportedAnyCourtCount: -2 });
    expect(neg.slots[0].state).toBe('planned');
  });

  it('attaches links by gameCourtId, then by courtId', () => {
    const r = derive({
      game: { ...game, maxParticipants: 8 },
      gameCourts: [gc('g1', 'c1', 0), gc('g2', 'c2', 1)],
      links: [link('a', { gameCourtId: 'g2', courtId: 'c1' }), link('b', { courtId: 'c1' })],
    });
    expect(r.slots[0].links.map((l) => l.id)).toEqual(['b']);
    expect(r.slots[1].links.map((l) => l.id)).toEqual(['a']);
    expect(r.summary.kind).toBe('reserved');
    expect(r.legacy).toEqual({ bookingStatus: 'EXTERNAL_FULL', hasBookedCourt: true });
  });

  it('falls back to courtId when the gameCourtId is stale', () => {
    const r = derive({ gameCourts: [gc('g1', 'c1', 0)], links: [link('a', { gameCourtId: 'gone', courtId: 'c1' })] });
    expect(r.slots[0].state).toBe('linked');
    expect(r.unplacedLinks).toEqual([]);
  });

  it('a link wins over a REPORTED flag on the same slot', () => {
    const r = derive({ gameCourts: [gc('g1', 'c1', 0, { reservation: 'REPORTED' })], links: [link('a', { courtId: 'c1' })] });
    expect(r.slots[0].state).toBe('linked');
    expect(r.legacy.bookingStatus).toBe('EXTERNAL_FULL');
  });

  it('places unmatched links into any-court slots, grouping by court', () => {
    const r = derive({
      game: { ...game, maxParticipants: 8 },
      links: [
        link('late', { courtId: 'c9', bookingStart: T('11:00'), bookingEnd: T('12:00') }),
        link('x', { courtId: 'c5' }),
        link('early', { courtId: 'c9', bookingStart: T('10:00'), bookingEnd: T('11:00') }),
      ],
    });
    expect(r.slots.map((s) => s.links.map((l) => l.id))).toEqual([['early', 'late'], ['x']]);
    expect(r.slots[0].effectiveCourtId).toBe('c9');
    expect(r.slots[0].courtId).toBeNull();
    expect(r.slots[0].gaps).toEqual([]);
    expect(r.summary.kind).toBe('reserved');
  });

  it('linked any-court slots come before reported ones, and links displace reports when slots run out', () => {
    const r = derive({
      game: { ...game, maxParticipants: 8 },
      reportedAnyCourtCount: 2,
      links: [link('a', { courtId: 'c1' })],
    });
    expect(r.slots.map((s) => s.state)).toEqual(['linked', 'reported']);
  });

  it('overflow links are unplaced and still drive the legacy external status', () => {
    const r = derive({
      gameCourts: [gc('g1', 'c1', 0)],
      links: [link('a', { courtId: 'c7' })],
    });
    expect(r.slots[0].state).toBe('planned');
    expect(r.unplacedLinks.map((l) => l.id)).toEqual(['a']);
    expect(r.summary.kind).toBe('planned');
    expect(r.legacy).toEqual({ bookingStatus: 'EXTERNAL_PARTIAL', hasBookedCourt: false });
  });

  it('sorts a slot’s links by start, unknown times last', () => {
    const r = derive({
      gameCourts: [gc('g1', 'c1', 0)],
      links: [
        link('z', { courtId: 'c1', bookingStart: null, bookingEnd: null }),
        link('b', { courtId: 'c1', bookingStart: T('11:00'), bookingEnd: T('12:00') }),
        link('a', { courtId: 'c1', bookingStart: T('10:00'), bookingEnd: T('11:00') }),
      ],
    });
    expect(r.slots[0].links.map((l) => l.id)).toEqual(['a', 'b', 'z']);
    expect(r.slots[0].links[0].startMs).toBe(Date.parse(T('10:00')));
    expect(r.slots[0].links[2].startMs).toBeNull();
  });
});

describe('deriveCourtReservations — coverage', () => {
  it('back-to-back links cover fully', () => {
    const r = derive({
      gameCourts: [gc('g1', 'c1', 0)],
      links: [
        link('a', { courtId: 'c1', bookingStart: T('10:00'), bookingEnd: T('11:00') }),
        link('b', { courtId: 'c1', bookingStart: T('11:00'), bookingEnd: T('12:00') }),
      ],
    });
    expect(r.slots[0].gaps).toEqual([]);
    expect(r.slots[0].coverage).toEqual({ coveredMinutes: 120, totalMinutes: 120 });
    expect(r.summary.kind).toBe('reserved');
  });

  it('a 30-minute hole is a gap and makes the summary reserved_with_gap', () => {
    const r = derive({
      gameCourts: [gc('g1', 'c1', 0)],
      links: [
        link('a', { courtId: 'c1', bookingStart: T('10:00'), bookingEnd: T('11:00') }),
        link('b', { courtId: 'c1', bookingStart: T('11:30'), bookingEnd: T('12:00') }),
      ],
    });
    expect(r.slots[0].gaps).toEqual([{ start: T('11:00'), end: T('11:30') }]);
    expect(r.slots[0].coverage).toEqual({ coveredMinutes: 90, totalMinutes: 120 });
    expect(r.summary).toEqual({
      kind: 'reserved_with_gap',
      reserved: 1,
      total: 1,
      gapCount: 1,
      earliestGap: { start: T('11:00'), end: T('11:30'), slotKey: 'gc:g1' },
    });
    expect(r.legacy).toEqual({ bookingStatus: 'EXTERNAL_PARTIAL', hasBookedCourt: true });
  });

  it('a link with no times is linked with a full-window gap and unknownTime', () => {
    const r = derive({ links: [link('a', { bookingStart: null, bookingEnd: null })] });
    expect(r.slots[0]).toMatchObject({
      state: 'linked',
      unknownTime: true,
      gaps: [{ start: T('10:00'), end: T('12:00') }],
      coverage: { coveredMinutes: 0, totalMinutes: 120 },
    });
    expect(r.summary.kind).toBe('reserved_with_gap');
  });

  it('picks the earliest gap across slots', () => {
    const r = derive({
      game: { ...game, maxParticipants: 8 },
      gameCourts: [gc('g1', 'c1', 0), gc('g2', 'c2', 1)],
      links: [
        link('a', { courtId: 'c1', bookingStart: T('10:00'), bookingEnd: T('11:30') }),
        link('b', { courtId: 'c2', bookingStart: T('10:30'), bookingEnd: T('12:00') }),
      ],
    });
    expect(r.summary.kind).toBe('reserved_with_gap');
    if (r.summary.kind === 'reserved_with_gap') {
      expect(r.summary.earliestGap).toEqual({ start: T('10:00'), end: T('10:30'), slotKey: 'gc:g2' });
      expect(r.summary.gapCount).toBe(2);
    }
  });

  it('partial with gaps stays partial', () => {
    const r = derive({
      game: { ...game, maxParticipants: 8 },
      links: [link('a', { bookingEnd: T('11:00') })],
    });
    expect(r.summary).toEqual({ kind: 'partial', reserved: 1, total: 2, gapCount: 1 });
  });

  it('skips coverage when the time is not set', () => {
    const r = derive({
      game: { ...game, timeIsSet: false },
      links: [link('a', { bookingEnd: T('10:30') })],
    });
    expect(r.slots[0].gaps).toEqual([]);
    expect(r.slots[0].coverage).toEqual({ coveredMinutes: 0, totalMinutes: 0 });
    expect(r.summary.kind).toBe('reserved');
  });

  it('an invalid game window yields no gaps', () => {
    const r = derive({ game: { ...game, endTime: 'bad' }, links: [link('a', { bookingEnd: T('10:30') })] });
    expect(r.slots[0].gaps).toEqual([]);
  });
});

describe('deriveCourtReservations — determinism', () => {
  it('is independent of input order', () => {
    const input: DeriveCourtReservationsInput = {
      game: { ...game, maxParticipants: 12 },
      gameCourts: [gc('g1', 'c1', 0), gc('g2', 'c2', 1, { reservation: 'REPORTED' })],
      courtSlotCount: 3,
      reportedAnyCourtCount: 0,
      links: [
        link('a', { courtId: 'c1', bookingEnd: T('11:00') }),
        link('b', { courtId: 'c1', bookingStart: T('11:00') }),
        link('c', { courtId: 'c8' }),
        link('d', { courtId: null }),
      ],
    };
    const reversed: DeriveCourtReservationsInput = {
      ...input,
      gameCourts: [...input.gameCourts].reverse(),
      links: [...input.links].reverse(),
    };
    expect(deriveCourtReservations(reversed)).toEqual(deriveCourtReservations(input));
    expect(deriveCourtReservations(input).unplacedLinks.map((l) => l.id)).toEqual(['d']);
  });
});

describe('summarizeCourtSlots', () => {
  it('handles an empty list as planned', () => {
    expect(summarizeCourtSlots([])).toEqual({ kind: 'planned', reserved: 0, total: 0, gapCount: 0 });
  });
});
