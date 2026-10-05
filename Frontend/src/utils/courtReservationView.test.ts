import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import type { Game } from '@/types';
import {
  buildCourtReservationsInput,
  formatReservationCopy,
  selectCourtReservationView,
  type CourtReservationGame,
} from './courtReservationView';

const T = (hhmm: string) => `2026-06-12T${hhmm}:00.000Z`;

const base: CourtReservationGame = {
  startTime: T('10:00'),
  endTime: T('12:00'),
  maxParticipants: 4,
  playersPerMatch: 4,
  timeIsSet: true,
};

type GameCourts = NonNullable<Game['gameCourts']>;
type Links = NonNullable<Game['linkedBookings']>;

const gc = (id: string, courtId: string, order: number, extra: Partial<GameCourts[number]> = {}) =>
  ({ id, gameId: 'g1', courtId, order, court: { id: courtId }, createdAt: '', updatedAt: '', ...extra }) as GameCourts[number];

const link = (id: string, extra: Partial<Links[number]> = {}): Links[number] => ({
  id,
  externalBookingId: `ext-${id}`,
  externalBookingProvider: 'BOOKTIME',
  bookingStart: T('10:00'),
  bookingEnd: T('12:00'),
  ...extra,
});

describe('buildCourtReservationsInput — legacy payloads', () => {
  it('hasBookedCourt without links reports every slot (assigned and any-court)', () => {
    const input = buildCourtReservationsInput({
      ...base,
      maxParticipants: 8,
      hasBookedCourt: true,
      gameCourts: [gc('gc1', 'c1', 0)],
    });
    expect(input.gameCourts).toEqual([
      expect.objectContaining({ gameCourtId: 'gc1', courtId: 'c1', reservation: 'REPORTED' }),
    ]);
    expect(input.reportedAnyCourtCount).toBe(1);
    expect(selectCourtReservationView({ ...base, maxParticipants: 8, hasBookedCourt: true }).summary).toMatchObject({
      kind: 'reserved',
      reserved: 2,
      total: 2,
    });
  });

  it('falls back to courtId as the single assigned slot', () => {
    const input = buildCourtReservationsInput({ ...base, courtId: 'c9', hasBookedCourt: false });
    expect(input.gameCourts).toEqual([
      expect.objectContaining({ gameCourtId: 'legacy:c9', courtId: 'c9', reservation: 'NONE' }),
    ]);
    expect(input.reportedAnyCourtCount).toBe(0);
  });

  it('links override the legacy manual flag', () => {
    const view = selectCourtReservationView({
      ...base,
      courtId: 'c1',
      hasBookedCourt: true,
      linkedBookings: [link('l1', { courtId: 'c1', bookingEnd: T('11:00') })],
    });
    expect(view.summary).toMatchObject({ kind: 'reserved_with_gap', reserved: 1, total: 1 });
    expect(view.slots[0].state).toBe('linked');
    expect(view.copy).toMatchObject({
      i18nKey: 'courtReservation.summary.reservedWithGap',
      params: { time: T('11:00') },
    });
    expect(view.approximate).toBe(false);
  });

  it('a fresh game is planned', () => {
    const view = selectCourtReservationView({ ...base, hasBookedCourt: false, bookingStatus: 'NONE' });
    expect(view.summary).toMatchObject({ kind: 'planned', reserved: 0, total: 1 });
    expect(view.copy.i18nKey).toBe('courtReservation.summary.planned');
  });
});

describe('buildCourtReservationsInput — current payloads', () => {
  it('uses gameCourts[].reservation, reportedAnyCourtCount and gameCourtId; ignores hasBookedCourt', () => {
    const view = selectCourtReservationView({
      ...base,
      maxParticipants: 16,
      courtSlotCount: 4,
      hasBookedCourt: true,
      reportedAnyCourtCount: 1,
      gameCourts: [
        gc('gc1', 'c1', 0, { reservation: 'REPORTED', reportedById: 'u1' }),
        gc('gc2', 'c2', 1, { reservation: 'NONE' }),
      ],
      linkedBookings: [link('l1', { courtId: 'c7', gameCourtId: 'gc2' })],
    });
    expect(view.slots.map((s) => s.state)).toEqual(['reported', 'linked', 'reported', 'planned']);
    expect(view.slots[0].reportedById).toBe('u1');
    expect(view.summary).toMatchObject({ kind: 'partial', reserved: 3, total: 4 });
    expect(view.copy).toMatchObject({ i18nKey: 'courtReservation.summary.partial', params: { reserved: 3, total: 4 } });
  });

  it('passes courtSlotCount through; without it the chosen courts set the slot count', () => {
    const game: CourtReservationGame = {
      ...base,
      maxParticipants: 8,
      reportedAnyCourtCount: 0,
      gameCourts: [gc('gc1', 'c1', 0, { reservation: 'NONE' })],
      linkedBookings: [link('l1', { courtId: 'c1', gameCourtId: 'gc1' })],
    };
    expect(buildCourtReservationsInput(game).courtSlotCount).toBeNull();
    expect(selectCourtReservationView(game).summary).toMatchObject({ kind: 'reserved', reserved: 1, total: 1 });
    expect(buildCourtReservationsInput({ ...game, courtSlotCount: 2 }).courtSlotCount).toBe(2);
    expect(selectCourtReservationView({ ...game, courtSlotCount: 2 }).summary).toMatchObject({
      kind: 'partial',
      reserved: 1,
      total: 2,
    });
  });

  it('reservation NONE stays planned even when the legacy flag says booked', () => {
    const view = selectCourtReservationView({
      ...base,
      hasBookedCourt: true,
      gameCourts: [gc('gc1', 'c1', 0, { reservation: 'NONE' })],
    });
    expect(view.summary.kind).toBe('planned');
  });
});

describe('selectCourtReservationView — payloads without links', () => {
  it('EXTERNAL_FULL without links is all reserved (approximate)', () => {
    const view = selectCourtReservationView({ ...base, maxParticipants: 8, bookingStatus: 'EXTERNAL_FULL', hasBookedCourt: true });
    expect(view.summary).toEqual({ kind: 'reserved', reserved: 2, total: 2, gapCount: 0 });
    expect(view.copy.i18nKey).toBe('courtReservation.summary.reserved');
    expect(view.approximate).toBe(true);
  });

  it('EXTERNAL_PARTIAL without links is a generic partly-reserved (no counts)', () => {
    const view = selectCourtReservationView({ ...base, bookingStatus: 'EXTERNAL_PARTIAL', hasBookedCourt: true });
    expect(view.summary.kind).toBe('partial');
    expect(view.copy.i18nKey).toBe('games.reservationPartly');
    expect(view.approximate).toBe(true);
  });

  it('known links win over a stale bookingStatus', () => {
    const view = selectCourtReservationView({
      ...base,
      bookingStatus: 'EXTERNAL_PARTIAL',
      linkedBookings: [link('l1')],
    });
    expect(view.summary.kind).toBe('reserved');
    expect(view.approximate).toBe(false);
  });
});

describe('formatReservationCopy', () => {
  const fakeT = ((key: string, options: Record<string, unknown> = {}) => {
    const value = String(options.defaultValue ?? key);
    return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name] ?? ''));
  }) as unknown as TFunction;

  it('formats time params and falls back to English when keys are missing', () => {
    const view = selectCourtReservationView({
      ...base,
      linkedBookings: [link('l1', { bookingEnd: T('11:00') })],
    });
    expect(formatReservationCopy(view.copy, fakeT, (iso) => iso.slice(11, 16))).toBe('Reserved, gap at 11:00');
  });

  it('interpolates counts', () => {
    const view = selectCourtReservationView({
      ...base,
      maxParticipants: 8,
      reportedAnyCourtCount: 1,
    });
    expect(formatReservationCopy(view.copy, fakeT, (iso) => iso)).toBe('1 of 2 reserved');
  });

  it('prefers the flat bundle, then the owned namespace', () => {
    const copy = selectCourtReservationView({ ...base }).copy;
    const flatT = ((key: string, o: Record<string, unknown> = {}) =>
      key === 'courtReservation.summary.planned' ? 'FLAT' : String(o.defaultValue)) as unknown as TFunction;
    const nsT = ((key: string, o: Record<string, unknown> = {}) =>
      key === 'courtReservation:summary.planned' ? 'NS' : String(o.defaultValue)) as unknown as TFunction;
    expect(formatReservationCopy(copy, flatT, (i) => i)).toBe('FLAT');
    expect(formatReservationCopy(copy, nsT, (i) => i)).toBe('NS');
  });
});
