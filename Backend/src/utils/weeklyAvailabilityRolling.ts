import { formatInTimeZone } from 'date-fns-tz';
import { DEFAULT_TIMEZONE } from './constants';

export const ROLLING_VERSION = 2 as const;

/** Same shape as `WeeklyAvailability` in validators (v1 bitmask week). */
export type WeeklyHourMaskV1 = {
  mon: number;
  tue: number;
  wed: number;
  thu: number;
  fri: number;
  sat: number;
  sun: number;
  v: 1;
};

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type RollingWeeklyAvailabilityV2 = {
  v: typeof ROLLING_VERSION;
  /** YYYY-MM-DD: start of slot-0 week in the city's local calendar */
  anchor: string;
  baseline: WeeklyHourMaskV1 | null;
  weeks: [WeeklyHourMaskV1 | null, WeeklyHourMaskV1 | null, WeeklyHourMaskV1 | null];
};

export function isRollingWeeklyAvailability(raw: unknown): raw is RollingWeeklyAvailabilityV2 {
  return (
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    (raw as { v?: unknown }).v === ROLLING_VERSION
  );
}

export function tryParseWeeklyAvailabilityV1(value: unknown): WeeklyHourMaskV1 | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (o.v !== 1) return null;
  const max = 0xffffff;
  const out: Partial<WeeklyHourMaskV1> = { v: 1 };
  for (const d of DAY_KEYS) {
    const raw = o[d];
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > max) return null;
    out[d] = raw;
  }
  return out as WeeklyHourMaskV1;
}

function cloneWeek(wa: WeeklyHourMaskV1): WeeklyHourMaskV1 {
  return { ...wa, v: 1 };
}

function weeksEqual(a: WeeklyHourMaskV1 | null | undefined, b: WeeklyHourMaskV1 | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  for (const d of DAY_KEYS) {
    if (((a[d] ?? 0) >>> 0) !== ((b[d] ?? 0) >>> 0)) return false;
  }
  return true;
}

export function weekStartPrefToMode(pref: string | null | undefined): 'monday' | 'sunday' {
  if (pref === 'sunday') return 'sunday';
  return 'monday';
}

/** Parse YYYY-MM-DD as UTC noon (safe for ±12h timezone arithmetic). */
function ymdToUtcNoon(ymd: string): Date {
  return new Date(ymd + 'T12:00:00Z');
}

/** Serialize a UTC-noon Date back to YYYY-MM-DD. */
function utcNoonToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addCalendarDaysYmd(ymd: string, days: number): string {
  const d = ymdToUtcNoon(ymd);
  d.setTime(d.getTime() + days * 86400000);
  return utcNoonToYmd(d);
}

/** ISO day-of-week (1=Mon … 7=Sun) for a YYYY-MM-DD. */
function isoDow(ymd: string): number {
  const dow = ymdToUtcNoon(ymd).getUTCDay(); // 0=Sun
  return dow === 0 ? 7 : dow;
}

export function weekStartContainingDate(
  dateYmd: string,
  startsOn: 'monday' | 'sunday'
): string {
  const dow = isoDow(dateYmd);
  let daysBack: number;
  if (startsOn === 'monday') {
    daysBack = dow - 1;
  } else {
    daysBack = dow === 7 ? 0 : dow;
  }
  return addCalendarDaysYmd(dateYmd, -daysBack);
}

/** Number of whole weeks from anchorYmd to targetWeekStartYmd (negative if before). */
export function weekOffsetFromAnchor(anchorYmd: string, targetWeekStartYmd: string): number {
  const diffMs = ymdToUtcNoon(targetWeekStartYmd).getTime() - ymdToUtcNoon(anchorYmd).getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays < 0) return -1;
  if (diffDays % 7 !== 0) return -1;
  return diffDays / 7;
}

export function fullWeekV1(): WeeklyHourMaskV1 {
  const mask = 0xffffff;
  return { mon: mask, tue: mask, wed: mask, thu: mask, fri: mask, sat: mask, sun: mask, v: 1 };
}

export function effectiveWeekMask(
  doc: RollingWeeklyAvailabilityV2,
  slotIndex: 0 | 1 | 2
): WeeklyHourMaskV1 {
  const base = doc.baseline ?? fullWeekV1();
  const slot = doc.weeks[slotIndex];
  return slot ? cloneWeek(slot) : cloneWeek(base);
}

export function compactSlotIfMatchesBaseline(
  slot: WeeklyHourMaskV1 | null,
  baseline: WeeklyHourMaskV1 | null
): WeeklyHourMaskV1 | null {
  if (slot == null) return null;
  const b = baseline ?? fullWeekV1();
  return weeksEqual(slot, b) ? null : cloneWeek(slot);
}

/** Returns today's YYYY-MM-DD in the given timezone (server-side, needs TZ). */
function todayYmdInTz(timeZone: string, now: Date): string {
  return formatInTimeZone(now, timeZone, 'yyyy-MM-dd');
}

export function normalizeRollingWeeklyAvailability(
  doc: RollingWeeklyAvailabilityV2,
  timeZone: string,
  weekStartPref: string | null | undefined,
  now: Date = new Date()
): RollingWeeklyAvailabilityV2 {
  const tz = timeZone || DEFAULT_TIMEZONE;
  const mode = weekStartPrefToMode(weekStartPref);
  const todayYmd = todayYmdInTz(tz, now);
  const targetAnchor = weekStartContainingDate(todayYmd, mode);

  let anchor = doc.anchor;
  let weeks: RollingWeeklyAvailabilityV2['weeks'] = [...doc.weeks] as RollingWeeklyAvailabilityV2['weeks'];
  const baseline = doc.baseline ? cloneWeek(doc.baseline) : null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    return { v: ROLLING_VERSION, anchor: targetAnchor, baseline, weeks: [null, null, null] };
  }

  if (anchor > targetAnchor) {
    return { v: ROLLING_VERSION, anchor: targetAnchor, baseline, weeks: [null, null, null] };
  }

  while (anchor < targetAnchor) {
    weeks = [weeks[1], weeks[2], null];
    anchor = addCalendarDaysYmd(anchor, 7);
  }

  return { v: ROLLING_VERSION, anchor, baseline, weeks };
}

export function migrateV1ToRolling(
  v1: WeeklyHourMaskV1,
  timeZone: string,
  weekStartPref: string | null | undefined,
  now?: Date
): RollingWeeklyAvailabilityV2 {
  const tz = timeZone || DEFAULT_TIMEZONE;
  const mode = weekStartPrefToMode(weekStartPref);
  const todayYmd = todayYmdInTz(tz, now ?? new Date());
  const anchor = weekStartContainingDate(todayYmd, mode);
  return { v: ROLLING_VERSION, anchor, baseline: cloneWeek(v1), weeks: [null, null, null] };
}

export function weeklyDocHasConfiguredSlots(raw: unknown): boolean {
  if (raw == null) return false;
  if (isRollingWeeklyAvailability(raw)) {
    const doc = raw as RollingWeeklyAvailabilityV2;
    if (doc.baseline && weeklyV1HasAnyAvailableHour(doc.baseline)) return true;
    for (const w of doc.weeks) {
      if (w && weeklyV1HasAnyAvailableHour(w)) return true;
    }
    return false;
  }
  const v1 = tryParseWeeklyAvailabilityV1(raw);
  return v1 ? weeklyV1HasAnyAvailableHour(v1) : false;
}

function weeklyV1HasAnyAvailableHour(wa: WeeklyHourMaskV1): boolean {
  for (const d of DAY_KEYS) {
    if (((wa[d] ?? 0) >>> 0) !== 0) return true;
  }
  return false;
}

export function resolveEffectiveWeeklyV1ForDate(
  raw: unknown,
  dateYmd: string,
  timeZone: string,
  weekStartPref: string | null | undefined
): WeeklyHourMaskV1 | null {
  const tz = timeZone || DEFAULT_TIMEZONE;
  const mode = weekStartPrefToMode(weekStartPref);

  if (raw == null) return null;

  if (isRollingWeeklyAvailability(raw)) {
    const doc = normalizeRollingWeeklyAvailability(raw as RollingWeeklyAvailabilityV2, tz, weekStartPref);
    const ws = weekStartContainingDate(dateYmd, mode);
    const idx = weekOffsetFromAnchor(doc.anchor, ws);
    if (idx === 0 || idx === 1 || idx === 2) {
      return effectiveWeekMask(doc, idx);
    }
    return doc.baseline ? cloneWeek(doc.baseline) : null;
  }

  const v1 = tryParseWeeklyAvailabilityV1(raw);
  return v1 ? cloneWeek(v1) : null;
}

export function ensureRollingDoc(
  raw: unknown,
  timeZone: string,
  weekStartPref: string | null | undefined,
  now?: Date
): RollingWeeklyAvailabilityV2 | null {
  if (raw == null) return null;
  const tz = timeZone || DEFAULT_TIMEZONE;
  if (isRollingWeeklyAvailability(raw)) {
    return normalizeRollingWeeklyAvailability(raw as RollingWeeklyAvailabilityV2, tz, weekStartPref, now);
  }
  const v1 = tryParseWeeklyAvailabilityV1(raw);
  if (!v1) return null;
  return normalizeRollingWeeklyAvailability(migrateV1ToRolling(v1, tz, weekStartPref, now), tz, weekStartPref, now);
}

export function assertValidRollingWeeklyAvailability(value: unknown): RollingWeeklyAvailabilityV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid rolling weeklyAvailability');
  }
  const o = value as Record<string, unknown>;
  if (o.v !== ROLLING_VERSION) throw new Error('Invalid rolling weeklyAvailability version');
  const anchor = o.anchor;
  if (typeof anchor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    throw new Error('Invalid rolling weeklyAvailability.anchor');
  }
  let baseline: WeeklyHourMaskV1 | null = null;
  if (o.baseline != null) {
    baseline = tryParseWeeklyAvailabilityV1(o.baseline);
    if (!baseline) throw new Error('Invalid rolling weeklyAvailability.baseline');
  }
  const w = o.weeks;
  if (!Array.isArray(w) || w.length !== 3) throw new Error('Invalid rolling weeklyAvailability.weeks');
  const weeks: RollingWeeklyAvailabilityV2['weeks'] = [null, null, null];
  for (let i = 0; i < 3; i++) {
    const cell = w[i];
    if (cell == null) {
      weeks[i] = null;
      continue;
    }
    const parsed = tryParseWeeklyAvailabilityV1(cell);
    if (!parsed) throw new Error(`Invalid rolling weeklyAvailability.weeks[${i}]`);
    weeks[i] = parsed;
  }
  return { v: ROLLING_VERSION, anchor, baseline, weeks };
}
