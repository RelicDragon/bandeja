/**
 * Club-local time helpers (Intl only, DST-safe). Every club admin surface — backend windows,
 * "today", grid rows, host messages — must go through these, never the device or server zone.
 */

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAY_ISO: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export interface ZonedParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** ISO weekday 1 = Monday ... 7 = Sunday. */
  weekday: number;
}

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const out: Record<string, string> = {};
  for (const p of partsFormatter(timeZone).formatToParts(instant)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAY_ISO[out.weekday] ?? 1,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isClubDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export function isClubTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

/** `HH:mm` → minutes from midnight. */
export function timeToMinutes(hhmm: string): number {
  const m = TIME_RE.exec(hhmm);
  if (!m) throw new RangeError(`Invalid HH:mm: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Club-local calendar date of an instant. */
export function clubLocalDate(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Club-local `HH:mm` of an instant. */
export function clubLocalTime(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Minutes since club-local midnight of an instant. */
export function clubLocalMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  return p.hour * 60 + p.minute;
}

/** `yyyy-MM-dd` ± days (pure calendar math). */
export function addDaysToDate(date: string, days: number): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid date: ${date}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** ISO weekday (1 = Mon) of a calendar date. */
export function isoWeekdayOfDate(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid date: ${date}`);
  const js = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return js === 0 ? 7 : js;
}

/** Inclusive day count between two calendar dates. */
export function daysBetweenInclusive(from: string, to: string): number {
  const a = DATE_RE.exec(from);
  const b = DATE_RE.exec(to);
  if (!a || !b) throw new RangeError('Invalid date');
  const ms =
    Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3])) - Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * The UTC instant at which the club wall clock shows `date` + `minutes` (minutes may exceed 1440
 * to address the next day). DST gaps resolve forward; overlaps resolve to the first occurrence.
 */
export function clubWallTimeToUtc(date: string, minutes: number, timeZone: string): Date {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid date: ${date}`);
  const wallUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, minutes);
  // Two passes converge for every real-world zone (offset changes at most once per window).
  let guess = wallUtc - offsetMs(new Date(wallUtc), timeZone);
  guess = wallUtc - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

/** Zone offset (local − UTC) in ms at an instant. */
export function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** [start, end) UTC instants of a club-local calendar day (23h/25h on DST days). */
export function clubDayWindowUtc(date: string, timeZone: string): { start: Date; end: Date } {
  return {
    start: clubWallTimeToUtc(date, 0, timeZone),
    end: clubWallTimeToUtc(addDaysToDate(date, 1), 0, timeZone),
  };
}

/** Opening window for a date given `HH:mm` open/close; `close <= open` rolls into the next day. */
export function openingWindowUtc(
  date: string,
  open: string,
  close: string,
  timeZone: string
): { start: Date; end: Date } {
  const o = timeToMinutes(open);
  let c = timeToMinutes(close);
  if (c <= o) c += 1440;
  return { start: clubWallTimeToUtc(date, o, timeZone), end: clubWallTimeToUtc(date, c, timeZone) };
}

/** Grid row starts (minutes from the date's midnight, may exceed 1440) for an opening window. */
export function scheduleRowMinutes(open: string, close: string, slotMinutes: number): number[] {
  const step = Math.max(5, Math.floor(slotMinutes));
  const o = timeToMinutes(open);
  let c = timeToMinutes(close);
  if (c <= o) c += 1440;
  const rows: number[] = [];
  for (let m = o; m < c; m += step) rows.push(m);
  return rows;
}

/** True when `instant` is valid; guards every `new Date(userInput)`. */
export function isValidInstant(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(new Date(value).getTime());
}
