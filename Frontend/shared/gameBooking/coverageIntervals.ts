/**
 * Half-open interval math for court reservations: `[start, end)`.
 *
 * Inputs are ISO instants; all arithmetic happens on epoch milliseconds so
 * offsets (`Z` vs `+02:00`) never matter. Invalid instants and empty or
 * negative intervals are dropped rather than thrown on — a bad snapshot must
 * not take down the game page.
 */

export const MINUTE_MS = 60_000;

/** ISO-string interval as stored/transported. */
export type IsoInterval = { start: string; end: string };

/** Interval whose bounds may be missing (e.g. a booking snapshot with no times). */
export type MaybeIsoInterval = { start?: string | null; end?: string | null };

/** Epoch-millisecond interval, `[start, end)`. */
export type MsInterval = { start: number; end: number };

/** Parses an ISO instant to epoch ms; `null` for missing or unparseable input. */
export function parseInstantMs(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string' || iso.length === 0) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** `null` unless both bounds parse and `end > start`. */
export function toMsInterval(interval: MaybeIsoInterval | null | undefined): MsInterval | null {
  if (!interval) return null;
  const start = parseInstantMs(interval.start);
  const end = parseInstantMs(interval.end);
  if (start == null || end == null || end <= start) return null;
  return { start, end };
}

export function toIsoInterval(interval: MsInterval): IsoInterval {
  return {
    start: new Date(interval.start).toISOString(),
    end: new Date(interval.end).toISOString(),
  };
}

/**
 * Sorts and merges overlapping **and touching** intervals (back-to-back
 * bookings are one continuous reservation). Empty/negative/non-finite
 * intervals are dropped. Never mutates the input.
 */
export function mergeIntervals(intervals: readonly MsInterval[]): MsInterval[] {
  const valid = intervals
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .map((i) => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: MsInterval[] = [];
  for (const interval of valid) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      if (interval.end > last.end) last.end = interval.end;
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

/** ISO convenience over {@link mergeIntervals}; invalid entries are dropped. */
export function unionIsoIntervals(intervals: readonly MaybeIsoInterval[]): IsoInterval[] {
  return mergeIntervals(collectMsIntervals(intervals)).map(toIsoInterval);
}

export function collectMsIntervals(intervals: readonly MaybeIsoInterval[]): MsInterval[] {
  const out: MsInterval[] = [];
  for (const interval of intervals) {
    const ms = toMsInterval(interval);
    if (ms) out.push(ms);
  }
  return out;
}

/**
 * True when the half-open intervals share at least one instant. Touching
 * intervals (`a.end === b.start`) do not overlap; empty intervals never do.
 */
export function intervalsOverlap(a: MsInterval, b: MsInterval): boolean {
  if (!(a.end > a.start) || !(b.end > b.start)) return false;
  return a.start < b.end && b.start < a.end;
}

/** ISO variant of {@link intervalsOverlap}; invalid input never overlaps. */
export function isoIntervalsOverlap(a: MaybeIsoInterval, b: MaybeIsoInterval): boolean {
  const am = toMsInterval(a);
  const bm = toMsInterval(b);
  return Boolean(am && bm && intervalsOverlap(am, bm));
}

/** Intersection of `interval` with `window`, or `null` when they do not overlap. */
export function clipInterval(interval: MsInterval, window: MsInterval): MsInterval | null {
  const start = Math.max(interval.start, window.start);
  const end = Math.min(interval.end, window.end);
  return end > start ? { start, end } : null;
}

/** Parts of `window` not covered by any of `intervals`, in time order. */
export function computeCoverageGapsMs(
  window: MsInterval,
  intervals: readonly MsInterval[],
): MsInterval[] {
  if (!(window.end > window.start)) return [];
  const covered = mergeIntervals(
    intervals
      .map((i) => clipInterval(i, window))
      .filter((i): i is MsInterval => i != null),
  );
  const gaps: MsInterval[] = [];
  let cursor = window.start;
  for (const interval of covered) {
    if (interval.start > cursor) gaps.push({ start: cursor, end: interval.start });
    if (interval.end > cursor) cursor = interval.end;
  }
  if (cursor < window.end) gaps.push({ start: cursor, end: window.end });
  return gaps;
}

/**
 * Uncovered sub-intervals of the game window. An invalid window yields `[]`
 * (nothing can be said to be missing); invalid intervals cover nothing.
 */
export function computeCoverageGaps(
  window: MaybeIsoInterval,
  intervals: readonly MaybeIsoInterval[],
): IsoInterval[] {
  const windowMs = toMsInterval(window);
  if (!windowMs) return [];
  return computeCoverageGapsMs(windowMs, collectMsIntervals(intervals)).map(toIsoInterval);
}

/** Total length of the merged intervals, in ms. */
export function totalLengthMs(intervals: readonly MsInterval[]): number {
  return mergeIntervals(intervals).reduce((sum, i) => sum + (i.end - i.start), 0);
}

/** Milliseconds of `window` covered by the union of `intervals`. */
export function coveredLengthMs(window: MsInterval, intervals: readonly MsInterval[]): number {
  if (!(window.end > window.start)) return 0;
  const gaps = computeCoverageGapsMs(window, intervals);
  return window.end - window.start - gaps.reduce((sum, g) => sum + (g.end - g.start), 0);
}

export function isWindowCovered(window: MsInterval, intervals: readonly MsInterval[]): boolean {
  return window.end > window.start && computeCoverageGapsMs(window, intervals).length === 0;
}

/** Whole minutes (floored) in a millisecond duration; never negative. */
export function msToMinutes(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / MINUTE_MS);
}

export function intervalMinutes(interval: MsInterval): number {
  return msToMinutes(interval.end - interval.start);
}

/** Minutes from `startIso` to `endIso`; 0 when invalid or reversed. */
export function minutesBetween(startIso: string | null | undefined, endIso: string | null | undefined): number {
  const start = parseInstantMs(startIso);
  const end = parseInstantMs(endIso);
  if (start == null || end == null) return 0;
  return msToMinutes(end - start);
}

export function addMinutesMs(ms: number, minutes: number): number {
  return ms + minutes * MINUTE_MS;
}
