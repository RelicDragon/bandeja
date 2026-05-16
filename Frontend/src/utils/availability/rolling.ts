import type { WeeklyAvailability, RollingWeeklyAvailabilityV2, WeeklyAvailabilityDoc } from '@/types';

export const ROLLING_VERSION = 2 as const;

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

// ─── Date helpers (pure, no TZ dependency) ────────────────────────────────────

/** Parse YYYY-MM-DD as UTC noon — safe within ±12 h of UTC. */
function ymdToUtcNoon(ymd: string): Date {
  return new Date(ymd + 'T12:00:00Z');
}

function utcNoonToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysToYmd(ymd: string, days: number): string {
  const d = ymdToUtcNoon(ymd);
  d.setTime(d.getTime() + days * 86400000);
  return utcNoonToYmd(d);
}

/** Today as YYYY-MM-DD in the browser's local clock (users are in the city). */
export function localTodayYmd(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** ISO day-of-week: 1=Mon … 7=Sun. */
function isoDow(ymd: string): number {
  const dow = ymdToUtcNoon(ymd).getUTCDay();
  return dow === 0 ? 7 : dow;
}

function weekStartContainingDate(ymd: string, startsOn: 'monday' | 'sunday'): string {
  const dow = isoDow(ymd);
  const daysBack = startsOn === 'monday' ? dow - 1 : dow === 7 ? 0 : dow;
  return addDaysToYmd(ymd, -daysBack);
}

// ─── Rolling doc helpers ──────────────────────────────────────────────────────

export function isRollingWeeklyAvailability(raw: unknown): raw is RollingWeeklyAvailabilityV2 {
  return (
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    (raw as { v?: unknown }).v === ROLLING_VERSION
  );
}

function fullWeekV1(): WeeklyAvailability {
  const mask = 0xffffff;
  return { mon: mask, tue: mask, wed: mask, thu: mask, fri: mask, sat: mask, sun: mask, v: 1 };
}

function cloneWeek(wa: WeeklyAvailability): WeeklyAvailability {
  return { ...wa, v: 1 };
}

function weeksEqual(a: WeeklyAvailability | null, b: WeeklyAvailability | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  for (const d of DAY_KEYS) {
    if (((a[d] ?? 0) >>> 0) !== ((b[d] ?? 0) >>> 0)) return false;
  }
  return true;
}

function isFullWeekMask(wa: WeeklyAvailability | null): boolean {
  if (wa == null) return true;
  const full = 0xffffff;
  return DAY_KEYS.every((d) => ((wa[d] ?? 0) >>> 0) === full);
}

/** True when the entire rolling doc resolves to 24/7 (no configured restrictions). */
export function isRollingDocDefault(doc: RollingWeeklyAvailabilityV2): boolean {
  if (!isFullWeekMask(doc.baseline)) return false;
  return doc.weeks.every((w) => w === null || isFullWeekMask(w));
}

export function effectiveSlotMask(
  doc: RollingWeeklyAvailabilityV2,
  slotIndex: 0 | 1 | 2
): WeeklyAvailability {
  const base = doc.baseline ?? fullWeekV1();
  const slot = doc.weeks[slotIndex];
  return slot ? cloneWeek(slot) : cloneWeek(base);
}

/** Normalize: advance anchor to current week, shifting/dropping stale slots. */
export function normalizeRollingDoc(
  doc: RollingWeeklyAvailabilityV2,
  startsOn: 'monday' | 'sunday',
  todayYmd: string = localTodayYmd()
): RollingWeeklyAvailabilityV2 {
  const targetAnchor = weekStartContainingDate(todayYmd, startsOn);
  let anchor = doc.anchor;
  let weeks: RollingWeeklyAvailabilityV2['weeks'] = [...doc.weeks] as RollingWeeklyAvailabilityV2['weeks'];
  const baseline = doc.baseline ? cloneWeek(doc.baseline) : null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || anchor > targetAnchor) {
    return { v: ROLLING_VERSION, anchor: targetAnchor, baseline, weeks: [null, null, null] };
  }

  while (anchor < targetAnchor) {
    weeks = [weeks[1], weeks[2], null];
    anchor = addDaysToYmd(anchor, 7);
  }

  return { v: ROLLING_VERSION, anchor, baseline, weeks };
}

/** Migrate a v1 (or null) weeklyAvailability to a rolling doc anchored to today. */
export function migrateToRolling(
  raw: WeeklyAvailability | null | undefined,
  startsOn: 'monday' | 'sunday',
  todayYmd: string = localTodayYmd()
): RollingWeeklyAvailabilityV2 {
  const anchor = weekStartContainingDate(todayYmd, startsOn);
  const baseline = raw ? cloneWeek(raw) : null;
  return { v: ROLLING_VERSION, anchor, baseline, weeks: [null, null, null] };
}

/**
 * Ensure the doc is a normalized rolling doc.
 * - null / v1 → migrate
 * - v2 → normalize (advance stale anchor)
 */
export function ensureNormalizedRollingDoc(
  raw: WeeklyAvailabilityDoc | null | undefined,
  startsOn: 'monday' | 'sunday',
  todayYmd: string = localTodayYmd()
): RollingWeeklyAvailabilityV2 {
  if (raw == null) return migrateToRolling(null, startsOn, todayYmd);
  if (isRollingWeeklyAvailability(raw)) return normalizeRollingDoc(raw, startsOn, todayYmd);
  return migrateToRolling(raw as WeeklyAvailability, startsOn, todayYmd);
}

/**
 * Update one slot in a rolling doc.
 * If the new mask equals the baseline, store null (compact).
 */
export function setRollingSlot(
  doc: RollingWeeklyAvailabilityV2,
  slotIndex: 0 | 1 | 2,
  mask: WeeklyAvailability | null
): RollingWeeklyAvailabilityV2 {
  const compacted =
    mask == null || weeksEqual(mask, doc.baseline ?? fullWeekV1()) ? null : cloneWeek(mask);
  const weeks = [...doc.weeks] as RollingWeeklyAvailabilityV2['weeks'];
  weeks[slotIndex] = compacted;
  return { ...doc, weeks };
}

/** Apply the same weekly mask to every rolling slot except the source (source unchanged). */
export function copyWeekMaskToOtherRollingSlots(
  doc: RollingWeeklyAvailabilityV2,
  sourceSlot: 0 | 1 | 2,
  mask: WeeklyAvailability
): RollingWeeklyAvailabilityV2 {
  let next = doc;
  for (const i of [0, 1, 2] as const) {
    if (i === sourceSlot) continue;
    next = setRollingSlot(next, i, mask);
  }
  return next;
}

/** Days between two YYYY-MM-DD strings (positive = target is after start). */
function daysBetweenYmd(startYmd: string, endYmd: string): number {
  return Math.round(
    (ymdToUtcNoon(endYmd).getTime() - ymdToUtcNoon(startYmd).getTime()) / 86400000
  );
}

/**
 * Resolve a v1 mask for the week containing `dateYmd`.
 * Uses day-offset arithmetic against the anchor — no weekStart needed,
 * because the anchor already encodes the correct week boundary.
 */
export function resolveV1ForDate(
  raw: WeeklyAvailabilityDoc | null | undefined,
  dateYmd: string
): WeeklyAvailability | null {
  if (raw == null) return null;
  if (!isRollingWeeklyAvailability(raw)) return raw as WeeklyAvailability;
  const doc = raw as RollingWeeklyAvailabilityV2;
  const days = daysBetweenYmd(doc.anchor, dateYmd);
  if (days >= 0 && days <= 6) return effectiveSlotMask(doc, 0);
  if (days >= 7 && days <= 13) return effectiveSlotMask(doc, 1);
  if (days >= 14 && days <= 20) return effectiveSlotMask(doc, 2);
  return doc.baseline ? cloneWeek(doc.baseline) : null;
}

/** Returns the effective v1 mask for today's week. */
export function resolveV1ForToday(
  raw: WeeklyAvailabilityDoc | null | undefined
): WeeklyAvailability | null {
  return resolveV1ForDate(raw, localTodayYmd());
}

/** Format a date range for a week tab label, e.g. "12–18 May". */
export function weekRangeLabel(weekStartYmd: string, locale = 'en'): string {
  const start = ymdToUtcNoon(weekStartYmd);
  const end = new Date(start.getTime() + 6 * 86400000);
  const fmt = (d: Date) =>
    d.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const sDay = start.getUTCDate();
  const eDay = end.getUTCDate();
  const sMonth = start.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' });
  const eMonth = end.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' });
  if (sMonth === eMonth) return `${sDay}–${eDay} ${eMonth}`;
  return `${fmt(start)} – ${fmt(end)}`;
}
