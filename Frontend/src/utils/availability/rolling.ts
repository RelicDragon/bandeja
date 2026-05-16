import type { WeeklyAvailability } from '@/types';

export const ROLLING_VERSION = 2 as const;

export type RollingWeeklyAvailabilityV2 = {
  v: typeof ROLLING_VERSION;
  /** YYYY-MM-DD: start of slot-0 week (local calendar, no TZ conversion needed). */
  anchor: string;
  baseline: WeeklyAvailability | null;
  weeks: [WeeklyAvailability | null, WeeklyAvailability | null, WeeklyAvailability | null];
};

export type WeeklyAvailabilityDoc = WeeklyAvailability | RollingWeeklyAvailabilityV2;

export type WeekStartPref = 'monday' | 'sunday' | 'auto';

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

export function weekStartContainingDate(ymd: string, startsOn: 'monday' | 'sunday'): string {
  const dow = isoDow(ymd);
  const daysBack = startsOn === 'monday' ? dow - 1 : dow === 7 ? 0 : dow;
  return addDaysToYmd(ymd, -daysBack);
}

/** Weeks from anchorYmd → targetWeekStartYmd. Returns -1 if before or not aligned. */
export function weekOffsetFromAnchor(anchorYmd: string, targetWeekStartYmd: string): number {
  const diffMs = ymdToUtcNoon(targetWeekStartYmd).getTime() - ymdToUtcNoon(anchorYmd).getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays < 0) return -1;
  if (diffDays % 7 !== 0) return -1;
  return diffDays / 7;
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

/** Resolve a v1 mask for the week containing `dateYmd` (or baseline/null for out-of-window). */
export function resolveV1ForDate(
  raw: WeeklyAvailabilityDoc | null | undefined,
  dateYmd: string,
  startsOn: 'monday' | 'sunday'
): WeeklyAvailability | null {
  if (raw == null) return null;
  if (!isRollingWeeklyAvailability(raw)) return raw as WeeklyAvailability;
  const doc = raw as RollingWeeklyAvailabilityV2;
  const ws = weekStartContainingDate(dateYmd, startsOn);
  const idx = weekOffsetFromAnchor(doc.anchor, ws);
  if (idx === 0 || idx === 1 || idx === 2) return effectiveSlotMask(doc, idx);
  return doc.baseline ? cloneWeek(doc.baseline) : null;
}

/** Returns the effective v1 mask for today's week (for player list matching, etc). */
export function resolveV1ForToday(
  raw: WeeklyAvailabilityDoc | null | undefined,
  startsOn: 'monday' | 'sunday' = 'monday'
): WeeklyAvailability | null {
  return resolveV1ForDate(raw, localTodayYmd(), startsOn);
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
