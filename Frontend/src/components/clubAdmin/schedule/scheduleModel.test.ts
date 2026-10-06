import { describe, expect, it } from 'vitest';
import type { ClubScheduleResponseV2, ScheduleSlotV2 } from '@shared/clubAdmin/contract';
import { clubWallTimeToUtc } from '@shared/clubAdmin/clubTime';
import {
  UNASSIGNED_COURT,
  buildScheduleModel,
  buildSlotIndex,
  coveredRows,
  fractionalRow,
  isRowOutsideHours,
  isRowPast,
  matchesFocus,
  nowLineTop,
  resolveCourts,
  resolveScheduleWindow,
} from './scheduleModel';

const TZ = 'Europe/Belgrade';
const at = (date: string, hhmm: string, tz = TZ) => {
  const [h, m] = hhmm.split(':').map(Number);
  return clubWallTimeToUtc(date, h * 60 + m, tz).toISOString();
};

function hold(id: string, courtId: string, date: string, from: string, to: string, extra: Partial<ScheduleSlotV2> = {}): ScheduleSlotV2 {
  return { type: 'hold', holdId: id, courtId, label: 'WALK_IN', note: null, startTime: at(date, from), endTime: at(date, to), ...extra } as ScheduleSlotV2;
}

function response(over: Partial<ClubScheduleResponseV2> = {}): ClubScheduleResponseV2 {
  return {
    slots: [],
    conflicts: [],
    isLoadingExternalSlots: false,
    hours: { open: '08:00', close: '22:00', openAt: '', closeAt: '' },
    slotMinutes: 30,
    courts: [
      { id: 'c2', name: 'Court 2', isIndoor: false, sport: null, isActive: true, sortOrder: 2 },
      { id: 'c1', name: 'Court 1', isIndoor: true, sport: null, isActive: true, sortOrder: 1 },
    ],
    ...over,
  };
}

describe('resolveScheduleWindow', () => {
  it('builds wall-clock rows for a normal day', () => {
    const w = resolveScheduleWindow({ date: '2026-10-06', timeZone: TZ, response: response(), legacy: null });
    expect(w.rows[0]).toBe(8 * 60);
    expect(w.rows).toHaveLength(28);
    expect(w.rowInstants).toHaveLength(29);
    expect(new Date(w.rowInstants[0]).toISOString()).toBe(at('2026-10-06', '08:00'));
    expect(w.closed).toBe(false);
  });

  it('runs past midnight for overnight hours instead of rendering an empty grid', () => {
    const w = resolveScheduleWindow({
      date: '2026-10-06',
      timeZone: TZ,
      response: response({ hours: { open: '18:00', close: '02:00', openAt: '', closeAt: '' }, slotMinutes: 60 }),
      legacy: null,
    });
    expect(w.rows).toEqual([1080, 1140, 1200, 1260, 1320, 1380, 1440, 1500]);
    expect(new Date(w.rowInstants[w.rowInstants.length - 1]).toISOString()).toBe(at('2026-10-07', '02:00'));
  });

  it('keeps rows DST-correct (spring forward: the 02:00 row is the same instant as 03:00)', () => {
    const w = resolveScheduleWindow({
      date: '2026-03-29',
      timeZone: TZ,
      response: response({ hours: { open: '00:00', close: '06:00', openAt: '', closeAt: '' }, slotMinutes: 60 }),
      legacy: null,
    });
    expect(w.rowInstants[3] - w.rowInstants[1]).toBe(60 * 60_000);
    // 01:30 local is half way through the 01:00 row.
    expect(fractionalRow(w, Date.parse(at('2026-03-29', '01:30')))).toBeCloseTo(1.5);
  });

  it('marks a day without hours as closed but still widens to bookings', () => {
    const r = response({ hours: null, slots: [hold('h', 'c1', '2026-10-06', '07:00', '08:30')] });
    const w = resolveScheduleWindow({ date: '2026-10-06', timeZone: TZ, response: r, legacy: null });
    expect(w.closed).toBe(true);
    expect(w.rows[0]).toBe(7 * 60);
    expect(isRowOutsideHours(w, 0)).toBe(true);
  });

  it('widens the configured window to cover early and late slots', () => {
    const r = response({ slots: [hold('a', 'c1', '2026-10-06', '06:30', '07:30'), hold('b', 'c1', '2026-10-06', '22:00', '23:00')] });
    const w = resolveScheduleWindow({ date: '2026-10-06', timeZone: TZ, response: r, legacy: null });
    expect(w.rows[0]).toBe(6 * 60 + 30);
    expect(w.rows[w.rows.length - 1] + w.step).toBe(23 * 60);
    expect(isRowOutsideHours(w, 0)).toBe(true);
    expect(isRowOutsideHours(w, w.rows.indexOf(9 * 60))).toBe(false);
  });

  it('falls back to the legacy club hours and slot length', () => {
    const w = resolveScheduleWindow({
      date: '2026-10-06',
      timeZone: TZ,
      response: { slots: [], conflicts: [], isLoadingExternalSlots: false },
      legacy: { openingTime: '09:00', closingTime: '12:00', defaultSlotMinutes: 60, courts: [] },
    });
    expect(w.rows).toEqual([540, 600, 660]);
  });

  it('honours a forced week range', () => {
    const w = resolveScheduleWindow({ date: '2026-10-06', timeZone: TZ, response: response(), legacy: null, range: { start: 420, end: 600, step: 60 } });
    expect(w.rows).toEqual([420, 480, 540]);
    expect(w.openMin).toBe(480);
  });
});

describe('slot index', () => {
  const date = '2026-10-06';
  const r = response({
    slots: [
      hold('a', 'c1', date, '10:00', '11:30'),
      hold('b', 'c1', date, '11:00', '12:00'),
      hold('c', 'c1', date, '13:00', '14:00'),
      {
        type: 'game',
        gameId: 'g1',
        courtId: null,
        startTime: at(date, '18:00'),
        endTime: at(date, '19:30'),
        hasBookedCourt: false,
        status: 'ANNOUNCED',
        entityType: 'GAME',
        name: null,
        host: { id: 'u', firstName: 'Ana', lastName: 'P', avatar: null },
        participantCount: 2,
      },
    ],
  });
  const w = resolveScheduleWindow({ date, timeZone: TZ, response: r, legacy: null });
  const index = buildSlotIndex(r.slots, w);

  it('places slots at fractional rows and sorts them per court', () => {
    const c1 = index.get('c1')!;
    expect(c1.map((p) => p.key)).toEqual(['hold:a', 'hold:b', 'hold:c']);
    expect(c1[0].startRow).toBe(4);
    expect(c1[0].endRow).toBe(7);
  });

  it('puts overlapping slots in side-by-side lanes, and only those', () => {
    const [a, b, c] = index.get('c1')!;
    expect([a.lane, a.lanes, b.lane, b.lanes]).toEqual([0, 2, 1, 2]);
    expect([c.lane, c.lanes]).toEqual([0, 1]);
  });

  it('indexes games without a court in the unassigned lane', () => {
    expect(index.get(UNASSIGNED_COURT)?.[0].key).toBe(`game:g1:${UNASSIGNED_COURT}`);
  });

  it('marks covered rows so free cells need no scan', () => {
    const covered = coveredRows(index, w.rows.length).get('c1')!;
    expect(covered.slice(3, 9)).toEqual([false, true, true, true, true, false]);
  });

  it('positions the now line from row geometry and hides it outside the window', () => {
    expect(nowLineTop(w, Date.parse(at(date, '09:15')), 40)).toBeCloseTo(2.5 * 40);
    expect(nowLineTop(w, Date.parse(at(date, '23:30')), 40)).toBeNull();
    expect(isRowPast(w, 0, Date.parse(at(date, '09:00')))).toBe(true);
    expect(isRowPast(w, 2, Date.parse(at(date, '09:00')))).toBe(false);
  });
});

describe('resolveCourts', () => {
  it('sorts by sortOrder, drops inactive courts without bookings, appends the unassigned lane', () => {
    const r = response({
      courts: [
        { id: 'c2', name: 'B', isIndoor: false, sport: null, isActive: true, sortOrder: 2 },
        { id: 'c1', name: 'A', isIndoor: true, sport: null, isActive: true, sortOrder: 1 },
        { id: 'c3', name: 'Off', isIndoor: false, sport: null, isActive: false, sortOrder: 3 },
        { id: 'c4', name: 'Off busy', isIndoor: false, sport: null, isActive: false, sortOrder: 4 },
      ],
      slots: [
        hold('x', 'c4', '2026-10-06', '10:00', '11:00'),
        { ...hold('y', 'c1', '2026-10-06', '10:00', '11:00'), type: 'game', gameId: 'g', courtId: null } as unknown as ScheduleSlotV2,
      ],
    });
    expect(resolveCourts(r, null, 'No court').map((c) => c.key)).toEqual(['c1', 'c2', 'c4', UNASSIGNED_COURT]);
  });

  it('builds a whole model', () => {
    const m = buildScheduleModel({ date: '2026-10-06', timeZone: TZ, response: response(), legacy: null, unassignedLabel: 'No court' });
    expect(m.courts.map((c) => c.name)).toEqual(['Court 1', 'Court 2']);
    expect(m.index.size).toBe(0);
  });
});

describe('matchesFocus', () => {
  it('matches booking ids from Today and Bookings to schedule slots', () => {
    const h = hold('h1', 'c1', '2026-10-06', '10:00', '11:00');
    expect(matchesFocus('hold:h1', h)).toBe(true);
    expect(matchesFocus('hold:h2', h)).toBe(false);
    expect(matchesFocus('game:h1', h)).toBe(false);
  });
});
