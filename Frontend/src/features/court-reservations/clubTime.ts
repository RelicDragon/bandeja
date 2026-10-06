/**
 * Every time in this feature is shown in the CLUB's timezone (the game's city),
 * never the device's — a player abroad must see the court's clock.
 */
import { MINUTE_MS, parseInstantMs } from '@shared/gameBooking/coverageIntervals';

export type ClubTimeFormatter = {
  timeZone: string;
  /** `19:00` / `7:00 PM`. Empty for an unparseable instant. */
  time(iso: string | number): string;
  /**
   * `19:00–20:30` (en dash), wrapped in a left-to-right isolate (U+2066 … U+2069)
   * so it never reads backwards inside Arabic / RTL text.
   */
  range(start: string | number, end: string | number): string;
  /** Local `yyyy-MM-dd` and `HH:mm` (provider booking params). */
  wallClock(iso: string | number): { dateKey: string; time: string } | null;
  /** `Tue 13 Oct` in the club's timezone. Empty for an unparseable instant. */
  day(iso: string | number): string;
};

export type ClubTimeOptions = { timeZone: string; locale?: string; hour12?: boolean };

function toDate(value: string | number): Date | null {
  const ms = typeof value === 'number' ? value : parseInstantMs(value);
  return ms == null || !Number.isFinite(ms) ? null : new Date(ms);
}

export function createClubTimeFormatter({ timeZone, locale = 'en-GB', hour12 = false }: ClubTimeOptions): ClubTimeFormatter {
  let display: Intl.DateTimeFormat;
  try {
    display = new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit', hour12 });
  } catch {
    display = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit', hour12 });
  }
  let dayFormat: Intl.DateTimeFormat;
  try {
    dayFormat = new Intl.DateTimeFormat(locale, { timeZone, weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  }
  const wall = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const time = (iso: string | number) => {
    const d = toDate(iso);
    return d ? display.format(d) : '';
  };
  return {
    timeZone,
    time,
    range: (start, end) => `\u2066${time(start)}–${time(end)}\u2069`,
    day: (iso) => {
      const d = toDate(iso);
      return d ? dayFormat.format(d) : '';
    },
    wallClock: (iso) => {
      const d = toDate(iso);
      if (!d) return null;
      const parts = Object.fromEntries(wall.formatToParts(d).map((p) => [p.type, p.value]));
      return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
    },
  };
}

/** `90` → `{ h: 1, m: 30 }`. */
export function splitMinutes(minutes: number): { h: number; m: number } {
  const total = Math.max(0, Math.round(minutes));
  return { h: Math.floor(total / 60), m: total % 60 };
}

export function minutesBetweenIso(start: string, end: string): number {
  const s = parseInstantMs(start);
  const e = parseInstantMs(end);
  return s == null || e == null ? 0 : Math.round((e - s) / MINUTE_MS);
}
