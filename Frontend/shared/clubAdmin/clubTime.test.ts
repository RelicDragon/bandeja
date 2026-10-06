import { describe, expect, it } from 'vitest';
import {
  addDaysToDate,
  clubDayWindowUtc,
  clubLocalDate,
  clubLocalTime,
  clubWallTimeToUtc,
  daysBetweenInclusive,
  isClubDate,
  isoWeekdayOfDate,
  openingWindowUtc,
  scheduleRowMinutes,
} from './clubTime';

describe('clubTime', () => {
  it('derives the club-local date, not the UTC date', () => {
    const instant = new Date('2026-10-06T23:30:00Z');
    expect(clubLocalDate(instant, 'Europe/Belgrade')).toBe('2026-10-07');
    expect(clubLocalDate(instant, 'America/New_York')).toBe('2026-10-06');
    expect(clubLocalTime(instant, 'Europe/Belgrade')).toBe('01:30');
  });

  it('builds day windows that are 23h/25h on DST days', () => {
    const spring = clubDayWindowUtc('2026-03-29', 'Europe/Belgrade');
    expect(spring.start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23);
    const autumn = clubDayWindowUtc('2026-10-25', 'Europe/Belgrade');
    expect((autumn.end.getTime() - autumn.start.getTime()) / 3_600_000).toBe(25);
  });

  it('maps wall time to UTC', () => {
    expect(clubWallTimeToUtc('2026-07-01', 9 * 60, 'Europe/Madrid').toISOString()).toBe('2026-07-01T07:00:00.000Z');
    expect(clubWallTimeToUtc('2026-01-15', 9 * 60, 'Asia/Bangkok').toISOString()).toBe('2026-01-15T02:00:00.000Z');
  });

  it('resolves DST overlaps to the first occurrence and gaps forward', () => {
    // 2026-10-25 Europe/Belgrade: 03:00 CEST → 02:00 CET, so 02:30 happens twice.
    expect(clubWallTimeToUtc('2026-10-25', 150, 'Europe/Belgrade').toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(clubWallTimeToUtc('2026-10-25', 210, 'Europe/Belgrade').toISOString()).toBe('2026-10-25T02:30:00.000Z');
    // 2026-03-29: 02:00 CET → 03:00 CEST, so 02:30 does not exist → 03:30 CEST.
    expect(clubWallTimeToUtc('2026-03-29', 150, 'Europe/Belgrade').toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(clubWallTimeToUtc('2026-11-01', 90, 'America/New_York').toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  it('rolls opening windows past midnight', () => {
    const w = openingWindowUtc('2026-07-01', '08:00', '01:00', 'Europe/Madrid');
    expect(w.start.toISOString()).toBe('2026-07-01T06:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-07-01T23:00:00.000Z');
    expect(scheduleRowMinutes('22:00', '01:00', 60)).toEqual([1320, 1380, 1440]);
    expect(scheduleRowMinutes('08:00', '00:00', 120).at(-1)).toBe(22 * 60);
  });

  it('does calendar math', () => {
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(isoWeekdayOfDate('2026-10-05')).toBe(1);
    expect(isoWeekdayOfDate('2026-10-11')).toBe(7);
    expect(daysBetweenInclusive('2026-10-01', '2026-10-30')).toBe(30);
    expect(isClubDate('2026-02-30')).toBe(false);
    expect(isClubDate('2026-02-28')).toBe(true);
  });
});
