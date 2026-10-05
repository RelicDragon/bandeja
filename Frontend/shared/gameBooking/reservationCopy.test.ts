import { describe, expect, it } from 'vitest';
import {
  COURT_RESERVATION_I18N_KEYS,
  describeBlocker,
  describeCourtSlot,
  describeReservationSummary,
  describeRescheduleOutcome,
  primaryBlocker,
  providerDisplayName,
  reservationSummaryTone,
} from './reservationCopy';
import type { OccupancyBlock, SlotOutcome } from './planReschedule';

const T = (hhmm: string) => `2026-06-12T${hhmm}:00.000Z`;

describe('describeCourtSlot', () => {
  it('planned', () => {
    expect(describeCourtSlot({ state: 'planned', provider: null, gaps: [], unknownTime: false })).toEqual({
      label: { i18nKey: 'courtReservation.slot.planned', tone: 'neutral', icon: 'calendar-event', params: {}, timeParams: [] },
      gaps: [],
    });
  });

  it('reported', () => {
    expect(describeCourtSlot({ state: 'reported', provider: null, gaps: [], unknownTime: false }).label).toMatchObject({
      i18nKey: 'courtReservation.slot.reported',
      tone: 'success',
    });
  });

  it('linked shows the provider display name', () => {
    expect(describeCourtSlot({ state: 'linked', provider: 'PADELOO', gaps: [], unknownTime: false })).toEqual({
      label: {
        i18nKey: 'courtReservation.slot.linked',
        tone: 'success',
        icon: 'calendar-check',
        params: { provider: 'Padeloo' },
        timeParams: [],
      },
      gaps: [],
    });
  });

  it('linked with gaps warns and lists each gap with ISO time params', () => {
    const r = describeCourtSlot({
      state: 'linked',
      provider: 'BOOKTIME',
      gaps: [{ start: T('11:00'), end: T('11:30') }],
      unknownTime: false,
    });
    expect(r.label.tone).toBe('warning');
    expect(r.gaps).toEqual([
      {
        i18nKey: 'courtReservation.slot.gap',
        tone: 'warning',
        icon: 'alert-triangle',
        params: { from: T('11:00'), to: T('11:30') },
        timeParams: ['from', 'to'],
      },
    ]);
  });

  it('unknown time replaces the gap list', () => {
    const r = describeCourtSlot({ state: 'linked', provider: 'WELTNER', gaps: [{ start: T('10:00'), end: T('12:00') }], unknownTime: true });
    expect(r.label).toMatchObject({ i18nKey: 'courtReservation.slot.unknownTime', tone: 'warning', params: { provider: 'Weltner' } });
    expect(r.gaps).toEqual([]);
  });
});

describe('describeReservationSummary', () => {
  it('maps every kind', () => {
    expect(describeReservationSummary({ kind: 'planned', reserved: 0, total: 2, gapCount: 0 })).toMatchObject({
      i18nKey: 'courtReservation.summary.planned',
      tone: 'neutral',
    });
    expect(describeReservationSummary({ kind: 'partial', reserved: 1, total: 2, gapCount: 0 })).toMatchObject({
      i18nKey: 'courtReservation.summary.partial',
      tone: 'warning',
      params: { reserved: 1, total: 2 },
    });
    expect(describeReservationSummary({ kind: 'reserved', reserved: 2, total: 2, gapCount: 0 })).toMatchObject({
      i18nKey: 'courtReservation.summary.reserved',
      tone: 'success',
    });
    expect(
      describeReservationSummary({
        kind: 'reserved_with_gap',
        reserved: 1,
        total: 1,
        gapCount: 1,
        earliestGap: { start: T('11:00'), end: T('11:30'), slotKey: 'gc:1' },
      }),
    ).toMatchObject({
      i18nKey: 'courtReservation.summary.reservedWithGap',
      tone: 'warning',
      params: { time: T('11:00') },
      timeParams: ['time'],
    });
  });

  it('tone helper agrees with the descriptor', () => {
    expect(reservationSummaryTone('planned')).toBe('neutral');
    expect(reservationSummaryTone('partial')).toBe('warning');
    expect(reservationSummaryTone('reserved')).toBe('success');
    expect(reservationSummaryTone('reserved_with_gap')).toBe('warning');
  });
});

describe('describeRescheduleOutcome', () => {
  it('has copy for every outcome; blocked is danger', () => {
    const outcomes: SlotOutcome[] = ['unchanged', 'keep', 'move', 'extend', 'switch_court', 'blocked', 'manual'];
    for (const o of outcomes) {
      const c = describeRescheduleOutcome(o);
      expect(c.i18nKey).toBe(`courtReservation.reschedule.${o}`);
      expect(c.icon.length).toBeGreaterThan(0);
    }
    expect(describeRescheduleOutcome('blocked').tone).toBe('danger');
  });
});

describe('keys and provider names', () => {
  it('all keys live in the courtReservation namespace', () => {
    const all = Object.values(COURT_RESERVATION_I18N_KEYS).flatMap((group) => Object.values(group));
    expect(all.every((k) => k.startsWith('courtReservation.'))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
  });

  it('providerDisplayName falls back to the raw code', () => {
    expect(providerDisplayName('KLIKTEREN')).toBe('Klikteren');
    expect(providerDisplayName('OTHER')).toBe('OTHER');
    expect(providerDisplayName(null)).toBe('');
  });
});

describe('blockers', () => {
  const club: OccupancyBlock = { courtId: 'c1', start: T('19:30'), end: T('21:00'), kind: 'club', label: 'Club booking' };
  const planned: OccupancyBlock = { courtId: 'c1', start: T('19:00'), end: T('20:00'), kind: 'app_game_planned', label: 'Ladies ladder' };
  const earlyHold: OccupancyBlock = { courtId: 'c1', start: T('17:00'), end: T('19:15'), kind: 'hold' };

  it('names the club booking at the time it starts inside the window', () => {
    const c = describeBlocker(club, 'Court 1', { start: T('19:00') });
    expect(c).toMatchObject({ i18nKey: 'courtReservation.blocker.club', params: { court: 'Court 1', time: T('19:30') }, timeParams: ['time'] });
  });

  it('a block that started earlier is named at the window start', () => {
    expect(describeBlocker(earlyHold, 'Court 1', { start: T('19:00') }).params.time).toBe(T('19:00'));
    expect(describeBlocker(earlyHold, 'Court 1', { start: T('19:00') }).i18nKey).toBe('courtReservation.blocker.hold');
  });

  it('games use their name, or a generic wording', () => {
    expect(describeBlocker(planned, 'Court 4').i18nKey).toBe('courtReservation.blocker.plannedGame');
    expect(describeBlocker({ ...planned, label: null }, 'Court 4').i18nKey).toBe('courtReservation.blocker.plannedGameUnnamed');
    expect(describeBlocker({ ...planned, kind: 'app_game_reserved' }, 'Court 4').i18nKey).toBe('courtReservation.blocker.game');
  });

  it('primaryBlocker: first block inside the window; club before a game at the same time', () => {
    const window = { start: T('19:00'), end: T('20:30') };
    expect(primaryBlocker([club, earlyHold], window)).toBe(earlyHold);
    expect(primaryBlocker([club], window)).toBe(club);
    const sameTime = { ...club, start: T('19:00') };
    expect(primaryBlocker([{ ...planned, kind: 'app_game_reserved' }, sameTime], window)).toBe(sameTime);
    // Rounding-only blocks (outside the window) are named only when nothing is inside.
    expect(primaryBlocker([{ ...club, start: T('20:30'), end: T('21:00') }], window)?.start).toBe(T('20:30'));
    expect(primaryBlocker([], window)).toBeNull();
  });
});
