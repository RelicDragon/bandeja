import { describe, expect, it } from 'vitest';
import {
  isQuickShortcutCurrent,
  parseQuickShortcutParam,
  resolveActiveQuickShortcut,
  resolveQuickShortcut,
  resolveWeekendDayKeys,
  weekdayOfDayKey,
} from './findQuickShortcuts';

/**
 * PRD 358 — the shortcut resolver is pure and timezone-aware. "Today" is the
 * Home-city day, Weekend is Saturday + Sunday from today on, and none of it
 * depends on the device clock or the week-start preference.
 */

const BELGRADE = 'Europe/Belgrade';
const BANGKOK = 'Asia/Bangkok';

describe('weekdayOfDayKey / resolveWeekendDayKeys', () => {
  it('maps day keys to weekdays without a timezone shift', () => {
    expect(weekdayOfDayKey('2026-09-21')).toBe(1); // Monday
    expect(weekdayOfDayKey('2026-09-26')).toBe(6); // Saturday
    expect(weekdayOfDayKey('2026-09-27')).toBe(0); // Sunday
  });

  it('targets the coming Saturday and Sunday from a weekday', () => {
    expect(resolveWeekendDayKeys('2026-09-21')).toEqual(['2026-09-26', '2026-09-27']); // Mon
    expect(resolveWeekendDayKeys('2026-09-25')).toEqual(['2026-09-26', '2026-09-27']); // Fri
  });

  it('keeps today when today is already the weekend, never a past day', () => {
    expect(resolveWeekendDayKeys('2026-09-26')).toEqual(['2026-09-26', '2026-09-27']); // Sat
    expect(resolveWeekendDayKeys('2026-09-27')).toEqual(['2026-09-27']); // Sun
  });

  it('crosses a month end', () => {
    expect(resolveWeekendDayKeys('2026-09-30')).toEqual(['2026-10-03', '2026-10-04']); // Wed
  });
});

describe('resolveQuickShortcut', () => {
  it('Tomorrow is the next city day, across a month end', () => {
    const now = new Date('2026-09-30T23:30:00Z'); // 01:30 Oct 1 Belgrade
    expect(resolveQuickShortcut('tomorrow', { now, timezone: BELGRADE })).toEqual({
      kind: 'tomorrow',
      selectedDay: '2026-10-02',
    });
    // Device in UTC still sees Sep 30; the city decides.
    const utcSide = new Date('2026-09-30T21:30:00Z'); // 23:30 Sep 30 Belgrade
    expect(resolveQuickShortcut('tomorrow', { now: utcSide, timezone: BELGRADE }).selectedDay).toBe(
      '2026-10-01',
    );
    // Same instant is already Oct 1 in Bangkok.
    expect(resolveQuickShortcut('tomorrow', { now: utcSide, timezone: BANGKOK }).selectedDay).toBe(
      '2026-10-02',
    );
  });

  it('Weekend selects Saturday and lists Saturday and Sunday', () => {
    const monday = new Date('2026-09-21T10:00:00Z');
    expect(resolveQuickShortcut('weekend', { now: monday, timezone: BELGRADE })).toEqual({
      kind: 'weekend',
      selectedDay: '2026-09-26',
      dayKeys: ['2026-09-26', '2026-09-27'],
    });
    const sunday = new Date('2026-09-27T10:00:00Z');
    expect(resolveQuickShortcut('weekend', { now: sunday, timezone: BELGRADE })).toEqual({
      kind: 'weekend',
      selectedDay: '2026-09-27',
      dayKeys: ['2026-09-27'],
    });
  });

  it('is stable across the DST change day', () => {
    // Europe/Belgrade leaves DST on 2026-10-25 at 03:00 → 02:00.
    const dstNight = new Date('2026-10-24T23:30:00Z'); // 01:30 Oct 25 CEST
    expect(resolveQuickShortcut('tomorrow', { now: dstNight, timezone: BELGRADE }).selectedDay).toBe(
      '2026-10-26',
    );
    const dstEvening = new Date('2026-10-25T20:30:00Z'); // 21:30 Oct 25 CET, 03:30 Oct 26 Bangkok
    expect(resolveQuickShortcut('tomorrow', { now: dstEvening, timezone: BELGRADE }).selectedDay).toBe(
      '2026-10-26',
    );
    expect(resolveQuickShortcut('tomorrow', { now: dstEvening, timezone: BANGKOK }).selectedDay).toBe(
      '2026-10-27',
    );
  });

  it('ignores the week-start preference: Saturday and Sunday either way', () => {
    // The resolver takes no week-start input on purpose; a Sunday-start or a
    // Monday-start calendar both mean the same weekend.
    const wednesday = new Date('2026-09-23T10:00:00Z');
    const keys = resolveQuickShortcut('weekend', { now: wednesday, timezone: BELGRADE }).dayKeys;
    expect(keys?.map(weekdayOfDayKey)).toEqual([6, 0]);
  });
});

describe('isQuickShortcutCurrent (stale after the clock moves)', () => {
  it('a Tomorrow preset holds within the day and is stale after midnight', () => {
    const applied = resolveQuickShortcut('tomorrow', {
      now: new Date('2026-09-22T17:00:00Z'),
      timezone: BELGRADE,
    });
    expect(
      isQuickShortcutCurrent(applied, { now: new Date('2026-09-22T21:30:00Z'), timezone: BELGRADE }),
    ).toBe(true); // 23:30 Belgrade
    expect(
      isQuickShortcutCurrent(applied, { now: new Date('2026-09-22T22:30:00Z'), timezone: BELGRADE }),
    ).toBe(false); // 00:30 next day
  });

  it('Weekend stays current until Sunday and expires as the day set shrinks', () => {
    const applied = resolveQuickShortcut('weekend', {
      now: new Date('2026-09-24T10:00:00Z'), // Thu
      timezone: BELGRADE,
    });
    expect(
      isQuickShortcutCurrent(applied, { now: new Date('2026-09-25T10:00:00Z'), timezone: BELGRADE }),
    ).toBe(true); // Fri
    expect(
      isQuickShortcutCurrent(applied, { now: new Date('2026-09-26T10:00:00Z'), timezone: BELGRADE }),
    ).toBe(true); // Sat: same Sat + Sun
    expect(
      isQuickShortcutCurrent(applied, { now: new Date('2026-09-27T10:00:00Z'), timezone: BELGRADE }),
    ).toBe(false); // Sun: Saturday is past
    expect(
      isQuickShortcutCurrent(applied, { now: new Date('2026-09-28T10:00:00Z'), timezone: BELGRADE }),
    ).toBe(false); // Mon
  });
});

describe('resolveActiveQuickShortcut (the row reflects the calendar)', () => {
  const now = new Date('2026-09-22T15:00:00Z'); // Tue 17:00 Belgrade
  const opts = { now, timezone: BELGRADE };
  const shown = (selectedDay: string | null, view: 'calendar' | 'list' = 'calendar') => ({ view, selectedDay });

  it('highlights Today when today is the selected day, however it got selected', () => {
    expect(resolveActiveQuickShortcut(shown('2026-09-22'), false, opts)).toBe('today');
  });

  it('highlights Tomorrow when tomorrow is selected, and nothing on other days', () => {
    expect(resolveActiveQuickShortcut(shown('2026-09-23'), false, opts)).toBe('tomorrow');
    expect(resolveActiveQuickShortcut(shown('2026-09-24'), false, opts)).toBeNull();
    expect(resolveActiveQuickShortcut(shown('2026-09-21'), false, opts)).toBeNull(); // yesterday
  });

  it('highlights Weekend for Saturday or Sunday of the coming weekend, pinned or not', () => {
    expect(resolveActiveQuickShortcut(shown('2026-09-26'), false, opts)).toBe('weekend');
    expect(resolveActiveQuickShortcut(shown('2026-09-27'), false, opts)).toBe('weekend');
    expect(resolveActiveQuickShortcut(shown('2026-09-26'), true, opts)).toBe('weekend');
    // Next weekend is just a day.
    expect(resolveActiveQuickShortcut(shown('2026-10-03'), false, opts)).toBeNull();
  });

  it('on Friday, tomorrow is Saturday and reads as Weekend', () => {
    const friday = { now: new Date('2026-09-25T10:00:00Z'), timezone: BELGRADE };
    expect(resolveActiveQuickShortcut(shown('2026-09-26'), false, friday)).toBe('weekend');
  });

  it('on a weekend day the pin decides between Today and Weekend', () => {
    const saturday = { now: new Date('2026-09-26T10:00:00Z'), timezone: BELGRADE };
    expect(resolveActiveQuickShortcut(shown('2026-09-26'), false, saturday)).toBe('today');
    expect(resolveActiveQuickShortcut(shown('2026-09-26'), true, saturday)).toBe('weekend');
    // Sunday under a Saturday clock is not today, so it is Weekend regardless.
    expect(resolveActiveQuickShortcut(shown('2026-09-27'), false, saturday)).toBe('weekend');
    const sunday = { now: new Date('2026-09-27T10:00:00Z'), timezone: BELGRADE };
    expect(resolveActiveQuickShortcut(shown('2026-09-27'), false, sunday)).toBe('today');
    expect(resolveActiveQuickShortcut(shown('2026-09-27'), true, sunday)).toBe('weekend');
    // Saturday is already past on Sunday.
    expect(resolveActiveQuickShortcut(shown('2026-09-26'), true, sunday)).toBeNull();
  });

  it('highlights nothing in list view or with no day', () => {
    expect(resolveActiveQuickShortcut(shown('2026-09-22', 'list'), false, opts)).toBeNull();
    expect(resolveActiveQuickShortcut(shown('2026-09-26', 'list'), true, opts)).toBeNull();
    expect(resolveActiveQuickShortcut(shown(null), false, opts)).toBeNull();
  });

  it('uses the city day, not the device day', () => {
    const late = { now: new Date('2026-09-22T22:30:00Z'), timezone: BELGRADE }; // 00:30 Sep 23
    expect(resolveActiveQuickShortcut(shown('2026-09-23'), false, late)).toBe('today');
  });
});

describe('parseQuickShortcutParam', () => {
  it('accepts only the two kinds, case-insensitively', () => {
    expect(parseQuickShortcutParam('tomorrow')).toBe('tomorrow');
    expect(parseQuickShortcutParam(' Weekend ')).toBe('weekend');
    expect(parseQuickShortcutParam('tonight')).toBeNull();
    expect(parseQuickShortcutParam('today')).toBeNull();
    expect(parseQuickShortcutParam('')).toBeNull();
    expect(parseQuickShortcutParam(undefined)).toBeNull();
    expect(parseQuickShortcutParam(3)).toBeNull();
  });
});
