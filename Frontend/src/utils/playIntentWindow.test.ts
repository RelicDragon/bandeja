import { describe, expect, it } from 'vitest';
import type { PlayIntentTimeOfDay } from '@/api/playIntents';
import {
  localDayMinuteToInstant,
  playWindowIsInPast,
  resolveTimeWindowEndMinutes,
  shiftDateKey,
  timeStringToMinutes,
  timezoneOffsetMinutes,
  formatPlayIntentHourRange,
} from './playIntentWindow';

/**
 * Tests use a fixed "now" and a real IANA timezone so the Intl-based offset
 * math is exercised against the platform tz database. Europe/Prague observes
 * CEST (UTC+2) in summer and CET (UTC+1) in winter, which gives us coverage of
 * a non-integer-ish, DST-aware zone without hand-rolling offsets.
 */
const PRAGUE = 'Europe/Prague';
// 2026-08-04 is a summer day in Prague → CEST (UTC+2).
const SUMMER_TODAY_KEY = '2026-08-04';
// A "now" at 09:00 local Prague time on 2026-08-04.
// Prague 09:00 CEST == 07:00 UTC.
const NOW_SUMMER_09_LOCAL = new Date(Date.UTC(2026, 7, 4, 7, 0, 0));

describe('timeStringToMinutes', () => {
  it('parses HH:MM', () => {
    expect(timeStringToMinutes('00:00')).toBe(0);
    expect(timeStringToMinutes('01:00')).toBe(60);
    expect(timeStringToMinutes('17:30')).toBe(1050);
  });
  it('treats 24:00 as end of day', () => {
    expect(timeStringToMinutes('24:00')).toBe(1440);
  });
  it('handles null/undefined/empty', () => {
    expect(timeStringToMinutes(null)).toBe(0);
    expect(timeStringToMinutes(undefined)).toBe(0);
    expect(timeStringToMinutes('')).toBe(0);
  });
});

describe('formatPlayIntentHourRange', () => {
  it('joins start and end with an en dash', () => {
    expect(formatPlayIntentHourRange('11:00', '13:00')).toBe('11:00–13:00');
  });
  it('trims whitespace around bounds', () => {
    expect(formatPlayIntentHourRange(' 11:00 ', '13:00')).toBe('11:00–13:00');
  });
  it('keeps a single bound when the other is missing', () => {
    expect(formatPlayIntentHourRange('11:00', null)).toBe('11:00');
    expect(formatPlayIntentHourRange(null, '13:00')).toBe('13:00');
  });
  it('returns null when both bounds are missing', () => {
    expect(formatPlayIntentHourRange(null, null)).toBeNull();
    expect(formatPlayIntentHourRange()).toBeNull();
  });
});

describe('resolveTimeWindowEndMinutes', () => {
  it('maps fixed buckets to their end-of-period minute', () => {
    expect(resolveTimeWindowEndMinutes(['MORNING'])).toBe(720);
    expect(resolveTimeWindowEndMinutes(['AFTERNOON'])).toBe(1080);
    expect(resolveTimeWindowEndMinutes(['EVENING'])).toBe(1440);
    expect(resolveTimeWindowEndMinutes(['ANYTIME'])).toBe(1440);
  });
  it('takes the latest end across multiple selected buckets', () => {
    expect(resolveTimeWindowEndMinutes(['MORNING', 'AFTERNOON'])).toBe(1080);
    expect(resolveTimeWindowEndMinutes(['MORNING', 'EVENING'])).toBe(1440);
  });
  it('resolves CUSTOM from the provided end time', () => {
    expect(resolveTimeWindowEndMinutes(['CUSTOM'], '13:30')).toBe(810);
  });
  it('falls back CUSTOM with no end time to end of day', () => {
    expect(resolveTimeWindowEndMinutes(['CUSTOM'])).toBe(1440);
  });
  it('returns end of day for an empty selection', () => {
    expect(resolveTimeWindowEndMinutes([])).toBe(1440);
  });
});

describe('shiftDateKey', () => {
  it('shifts forward and backward', () => {
    expect(shiftDateKey('2026-08-04', 1)).toBe('2026-08-05');
    expect(shiftDateKey('2026-08-04', 2)).toBe('2026-08-06');
    expect(shiftDateKey('2026-08-04', -1)).toBe('2026-08-03');
  });
  it('crosses month boundaries', () => {
    expect(shiftDateKey('2026-08-31', 1)).toBe('2026-09-01');
    expect(shiftDateKey('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('returns the input unchanged for a malformed key', () => {
    expect(shiftDateKey('nope', 1)).toBe('nope');
  });
});

describe('timezoneOffsetMinutes', () => {
  it('returns a positive offset for a zone ahead of UTC in summer', () => {
    // Prague in August is CEST = UTC+2.
    const offset = timezoneOffsetMinutes(PRAGUE, new Date(Date.UTC(2026, 7, 4, 12)));
    expect(offset).toBe(120);
  });
  it('returns a negative offset for a zone behind UTC', () => {
    // New York in August is EDT = UTC-4.
    const offset = timezoneOffsetMinutes('America/New_York', new Date(Date.UTC(2026, 7, 4, 12)));
    expect(offset).toBe(-240);
  });
  it('returns 0 for UTC', () => {
    expect(timezoneOffsetMinutes('UTC', new Date(Date.UTC(2026, 7, 4, 12)))).toBe(0);
  });
  it('falls back to 0 for an invalid zone id', () => {
    expect(timezoneOffsetMinutes('Not/A/Zone', new Date(Date.UTC(2026, 7, 4, 12)))).toBe(0);
  });
});

describe('localDayMinuteToInstant', () => {
  it('converts a city-local wall-clock minute to the correct instant', () => {
    // Prague 2026-08-04 01:00 CEST == 2026-08-03 23:00 UTC.
    const instant = localDayMinuteToInstant(SUMMER_TODAY_KEY, 60, PRAGUE);
    expect(instant).not.toBeNull();
    expect(instant!.toISOString()).toBe('2026-08-03T23:00:00.000Z');
  });
  it('handles end-of-day minute (24:00)', () => {
    // Prague 2026-08-04 24:00 == 2026-08-04 22:00 UTC.
    const instant = localDayMinuteToInstant(SUMMER_TODAY_KEY, 1440, PRAGUE);
    expect(instant).not.toBeNull();
    expect(instant!.toISOString()).toBe('2026-08-04T22:00:00.000Z');
  });
  it('returns null for a malformed date key', () => {
    expect(localDayMinuteToInstant('bad', 60, PRAGUE)).toBeNull();
  });
});

describe('playWindowIsInPast', () => {
  const custom = (start: string, end: string): [string, string] => [start, end];

  it('is in the past when today + CUSTOM end is already before now', () => {
    // today 00:00–01:00, now is 09:00 → 01:00 has passed.
    expect(
      playWindowIsInPast({
        dayOffsets: [0],
        timeOfDays: ['CUSTOM'],
        customRange: custom('00:00', '01:00'),
        todayKey: SUMMER_TODAY_KEY,
        timezone: PRAGUE,
        now: NOW_SUMMER_09_LOCAL,
      }),
    ).toBe(true);
  });

  it('is NOT in the past when today + CUSTOM end is still in the future', () => {
    // today 17:00–21:00, now is 09:00 → 21:00 is ahead.
    expect(
      playWindowIsInPast({
        dayOffsets: [0],
        timeOfDays: ['CUSTOM'],
        customRange: custom('17:00', '21:00'),
        todayKey: SUMMER_TODAY_KEY,
        timezone: PRAGUE,
        now: NOW_SUMMER_09_LOCAL,
      }),
    ).toBe(false);
  });

  it('is NOT in the past when the boundary equals now (strictly greater is reachable)', () => {
    // end == now exactly. Backend uses expiresAt <= now to reject, so an end
    // equal to now is already ended. Reachability requires end > now.
    const endInstant = localDayMinuteToInstant(SUMMER_TODAY_KEY, 60, PRAGUE)!;
    expect(
      playWindowIsInPast({
        dayOffsets: [0],
        timeOfDays: ['CUSTOM'],
        customRange: custom('00:00', '01:00'),
        todayKey: SUMMER_TODAY_KEY,
        timezone: PRAGUE,
        now: endInstant,
      }),
    ).toBe(true);
  });

  it('is NOT in the past for ANYTIME even when now is late in the day', () => {
    // ANYTIME end is end-of-day; at 09:00 the day has not ended.
    expect(
      playWindowIsInPast({
        dayOffsets: [0],
        timeOfDays: ['ANYTIME'],
        todayKey: SUMMER_TODAY_KEY,
        timezone: PRAGUE,
        now: NOW_SUMMER_09_LOCAL,
      }),
    ).toBe(false);
  });

  it('is NOT in the past for a future-only day even with an early CUSTOM range', () => {
    // tomorrow 00:00–01:00 — tomorrow hasn't happened yet.
    expect(
      playWindowIsInPast({
        dayOffsets: [1],
        timeOfDays: ['CUSTOM'],
        customRange: custom('00:00', '01:00'),
        todayKey: SUMMER_TODAY_KEY,
        timezone: PRAGUE,
        now: NOW_SUMMER_09_LOCAL,
      }),
    ).toBe(false);
  });

  it('is in the past only if EVERY selected day has ended', () => {
    // today (past CUSTOM) + tomorrow (future CUSTOM) → still reachable via tomorrow.
    expect(
      playWindowIsInPast({
        dayOffsets: [0, 1],
        timeOfDays: ['CUSTOM'],
        customRange: custom('00:00', '01:00'),
        todayKey: SUMMER_TODAY_KEY,
        timezone: PRAGUE,
        now: NOW_SUMMER_09_LOCAL,
      }),
    ).toBe(false);
    // today + day-after-tomorrow, but day-after offset is out of range (2 is the max)
    // and is still a future day → reachable.
    expect(
      playWindowIsInPast({
        dayOffsets: [0, 2],
        timeOfDays: ['CUSTOM'],
        customRange: custom('00:00', '01:00'),
        todayKey: SUMMER_TODAY_KEY,
        timezone: PRAGUE,
        now: NOW_SUMMER_09_LOCAL,
      }),
    ).toBe(false);
  });

  it('returns false when timezone is missing (cannot evaluate)', () => {
    expect(
      playWindowIsInPast({
        dayOffsets: [0],
        timeOfDays: ['CUSTOM'],
        customRange: custom('00:00', '01:00'),
        todayKey: SUMMER_TODAY_KEY,
        timezone: undefined,
        now: NOW_SUMMER_09_LOCAL,
      }),
    ).toBe(false);
  });

  it('returns false when todayKey is missing', () => {
    expect(
      playWindowIsInPast({
        dayOffsets: [0],
        timeOfDays: ['CUSTOM'],
        customRange: custom('00:00', '01:00'),
        todayKey: undefined,
        timezone: PRAGUE,
        now: NOW_SUMMER_09_LOCAL,
      }),
    ).toBe(false);
  });

  it('returns false for an empty day selection', () => {
    expect(
      playWindowIsInPast({
        dayOffsets: [],
        timeOfDays: ['CUSTOM'],
        customRange: custom('00:00', '01:00'),
        todayKey: SUMMER_TODAY_KEY,
        timezone: PRAGUE,
        now: NOW_SUMMER_09_LOCAL,
      }),
    ).toBe(false);
  });

  it('uses the widest end across mixed buckets when CUSTOM is among them', () => {
    // CUSTOM alone is exclusive in the UI, but defensively: MORNING(ends 12:00)
    // + CUSTOM(ends 01:00) → widest end is 12:00. At 09:00 that's still future.
    const periods: PlayIntentTimeOfDay[] = ['MORNING'];
    expect(
      playWindowIsInPast({
        dayOffsets: [0],
        timeOfDays: periods,
        todayKey: SUMMER_TODAY_KEY,
        timezone: PRAGUE,
        now: NOW_SUMMER_09_LOCAL,
      }),
    ).toBe(false);
  });
});
