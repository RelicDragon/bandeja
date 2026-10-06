/**
 * Club console price quotes (pure, no database). docs/domains/club-admin.md "Pricing".
 *
 * A booking `[start, end)` on a court is split at club-local wall-clock boundaries (midnight and
 * every rule edge), so spans past midnight and DST days price correctly: every *real* elapsed
 * minute is billed at the rate of the rule that covers its wall-clock minute. Rule choice per
 * minute: a court-specific rule beats a club-wide one, then the later `startMinute`, then the
 * smaller id (deterministic). Minutes no rule covers use the court's legacy `pricePerHour`;
 * if that is unset too the quote is `null` — a partly priced booking has no quote, never a
 * silently low one. Money is rounded to cents once, at the end.
 */
import {
  addDaysToDate,
  clubLocalDate,
  clubWallTimeToUtc,
  daysBetweenInclusive,
  isoWeekdayOfDate,
  offsetMs,
  zonedParts,
} from '@bandeja/shared/clubAdmin/clubTime';

export interface QuoteRule {
  id: string;
  courtId: string | null;
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  pricePerHourCents: number;
}

export interface QuoteBreakdownLine {
  ruleId: string | null;
  minutes: number;
  pricePerHourCents: number;
}

export interface QuoteResult {
  amountCents: number | null;
  breakdown: QuoteBreakdownLine[];
}

const MS_PER_HOUR = 3_600_000;
/** Edges repeat across every booking of a report; Intl calls are the hot path. */
const WALL_CACHE_MAX = 50_000;
const wallInstantCache = new Map<string, number>();
const steadyDays = new Map<string, { startMs: number; steady: boolean }>();

/** Wall minutes of `instantMs` counted from the start of club-local `date` (may exceed 1440). */
function wallMinutesFrom(date: string, instantMs: number, timezone: string): number {
  const p = zonedParts(new Date(instantMs), timezone);
  const local = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  return (daysBetweenInclusive(date, local) - 1) * 1440 + p.hour * 60 + p.minute;
}

/**
 * The first instant at which the club wall clock reads `minutes` (from `date`'s midnight) or later.
 * Same as `clubWallTimeToUtc` for wall times that exist; a wall time inside a spring-forward gap
 * maps to the transition instant (where the clock jumps past it), so boundaries stay ordered.
 * Repeated fall-back wall times resolve to their first occurrence.
 */
export function wallInstantMs(date: string, minutes: number, timezone: string): number {
  // Most days have no zone transition within the 48 h a window can span: plain arithmetic.
  const day = steadyDay(date, timezone);
  if (day.steady) return day.startMs + minutes * 60_000;
  const key = `${timezone}|${date}|${minutes}`;
  const hit = wallInstantCache.get(key);
  if (hit !== undefined) return hit;
  const value = resolveWallInstant(date, minutes, timezone);
  if (wallInstantCache.size >= WALL_CACHE_MAX) wallInstantCache.clear();
  wallInstantCache.set(key, value);
  return value;
}

function steadyDay(date: string, timezone: string): { startMs: number; steady: boolean } {
  const key = `${timezone}|${date}`;
  let day = steadyDays.get(key);
  if (!day) {
    const startMs = clubWallTimeToUtc(date, 0, timezone).getTime();
    const steady =
      wallMinutesFrom(date, startMs, timezone) === 0 &&
      offsetMs(new Date(startMs), timezone) === offsetMs(new Date(startMs + 48 * MS_PER_HOUR), timezone);
    day = { startMs, steady };
    if (steadyDays.size >= WALL_CACHE_MAX) steadyDays.clear();
    steadyDays.set(key, day);
  }
  return day;
}

function resolveWallInstant(date: string, minutes: number, timezone: string): number {
  const t = clubWallTimeToUtc(date, minutes, timezone).getTime();
  if (wallMinutesFrom(date, t, timezone) === minutes) {
    // Repeated (fall-back) wall time: prefer the first occurrence.
    for (const back of [3_600_000, 1_800_000]) {
      if (wallMinutesFrom(date, t - back, timezone) === minutes) return t - back;
    }
    return t;
  }
  let x = t;
  for (let i = 0; i < 180; i++) {
    const prev = x - 60_000;
    if (wallMinutesFrom(date, prev, timezone) < minutes) break;
    x = prev;
  }
  return x;
}

/** The rule that prices wall-clock minute `minute` of a day, or null. */
export function pickRule(rules: readonly QuoteRule[], minute: number): QuoteRule | null {
  let best: QuoteRule | null = null;
  for (const r of rules) {
    if (minute < r.startMinute || minute >= r.endMinute) continue;
    if (!best) {
      best = r;
      continue;
    }
    const specific = r.courtId !== null;
    const bestSpecific = best.courtId !== null;
    if (specific !== bestSpecific) {
      if (specific) best = r;
      continue;
    }
    if (r.startMinute !== best.startMinute) {
      if (r.startMinute > best.startMinute) best = r;
      continue;
    }
    if (r.id < best.id) best = r;
  }
  return best;
}

/** Quote for `courtId` over `[start, end)`. `courtId: null` can only use club-wide rules. */
export function quoteCourtTime(input: {
  courtId: string | null;
  start: Date;
  end: Date;
  timezone: string;
  rules: readonly QuoteRule[];
  fallbackPricePerHourCents: number | null;
}): QuoteResult {
  const { courtId, start, end, timezone } = input;
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (!(endMs > startMs)) return { amountCents: 0, breakdown: [] };
  const applicable = input.rules.filter((r) => r.courtId === null || (courtId !== null && r.courtId === courtId));
  const fallback = courtId !== null ? input.fallbackPricePerHourCents : null;

  const lines = new Map<string, { ruleId: string | null; ms: number; price: number }>();
  let unpriced = false;
  let rawCents = 0;
  const lastDate = clubLocalDate(new Date(endMs - 1), timezone);
  for (let date = clubLocalDate(start, timezone), guard = 0; date <= lastDate && guard < 400; date = addDaysToDate(date, 1), guard++) {
    const weekday = isoWeekdayOfDate(date);
    const dayRules = applicable.filter((r) => r.weekdays.includes(weekday));
    const edges = new Set<number>([0, 1440]);
    for (const r of dayRules) {
      edges.add(r.startMinute);
      edges.add(r.endMinute);
    }
    const sorted = [...edges].filter((m) => m >= 0 && m <= 1440).sort((a, b) => a - b);
    const instants = sorted.map((m) => wallInstantMs(date, m, timezone));
    for (let i = 0; i < sorted.length - 1; i++) {
      const segStart = Math.max(instants[i], startMs);
      const segEnd = Math.min(instants[i + 1], endMs);
      if (segEnd <= segStart) continue;
      const ms = segEnd - segStart;
      const rule = pickRule(dayRules, sorted[i]);
      const price = rule ? rule.pricePerHourCents : fallback;
      if (price == null) {
        unpriced = true;
        continue;
      }
      const ruleId = rule ? rule.id : null;
      const key = `${ruleId ?? ''}|${price}`;
      const line = lines.get(key) ?? { ruleId, ms: 0, price };
      line.ms += ms;
      lines.set(key, line);
      rawCents += (ms * price) / MS_PER_HOUR;
    }
  }
  return {
    amountCents: unpriced ? null : Math.round(rawCents),
    breakdown: [...lines.values()].map((l) => ({
      ruleId: l.ruleId,
      minutes: Math.round(l.ms / 60_000),
      pricePerHourCents: l.price,
    })),
  };
}

/** Sum of per-court quotes (a multi-court game pays for each court at this club). Null if any is. */
export function sumQuotes(amounts: Array<number | null>): number | null {
  if (amounts.length === 0) return null;
  let total = 0;
  for (const a of amounts) {
    if (a == null) return null;
    total += a;
  }
  return total;
}
