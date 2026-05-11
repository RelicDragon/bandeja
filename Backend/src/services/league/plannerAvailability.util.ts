/** Mirrors Frontend `utils/availability` bitmask + bucket rules for league planner. */

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type BucketId = 'night' | 'morning' | 'afternoon' | 'evening';

export interface WeeklyAvailabilityLike {
  mon?: number;
  tue?: number;
  wed?: number;
  thu?: number;
  fri?: number;
  sat?: number;
  sun?: number;
}

export type AvailabilityBucketBoundariesLike = {
  night: number;
  morning: number;
  afternoon: number;
  evening: number;
};

const DEFAULT_BOUNDARIES: AvailabilityBucketBoundariesLike = {
  night: 0,
  morning: 6,
  afternoon: 12,
  evening: 18,
};

export const WEEKDAY_FROM_SHORT: Record<string, WeekdayKey> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
};

export function parseBoundaries(raw: unknown): AvailabilityBucketBoundariesLike {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_BOUNDARIES;
  const o = raw as Record<string, unknown>;
  const ok = (x: unknown): x is number =>
    typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 23;
  if (!ok(o.night) || !ok(o.morning) || !ok(o.afternoon) || !ok(o.evening)) {
    return DEFAULT_BOUNDARIES;
  }
  if (!(o.night < o.morning && o.morning < o.afternoon && o.afternoon < o.evening)) {
    return DEFAULT_BOUNDARIES;
  }
  return {
    night: o.night,
    morning: o.morning,
    afternoon: o.afternoon,
    evening: o.evening,
  };
}

export function rangeMask(startHour: number, endHourExclusive: number): number {
  let m = 0;
  const start = Math.max(0, Math.min(24, startHour));
  const end = Math.max(0, Math.min(24, endHourExclusive));
  for (let h = start; h < end; h++) m = (m | (1 << h)) >>> 0;
  return m;
}

export function buildBucketMasks(b: AvailabilityBucketBoundariesLike): Record<BucketId, number> {
  const { night, morning, afternoon, evening } = b;
  return {
    night: rangeMask(night, morning) >>> 0,
    morning: rangeMask(morning, afternoon) >>> 0,
    afternoon: rangeMask(afternoon, evening) >>> 0,
    evening: ((rangeMask(evening, 24) | rangeMask(0, night)) >>> 0),
  };
}

export function bucketIsFullFor(
  wa: WeeklyAvailabilityLike,
  day: WeekdayKey,
  bucket: BucketId,
  boundaries: AvailabilityBucketBoundariesLike
): boolean {
  const mask = buildBucketMasks(boundaries)[bucket];
  const d = (wa[day] ?? 0) >>> 0;
  return (d & mask) === mask;
}

export function bucketIsPartialFor(
  wa: WeeklyAvailabilityLike,
  day: WeekdayKey,
  bucket: BucketId,
  boundaries: AvailabilityBucketBoundariesLike
): boolean {
  const mask = buildBucketMasks(boundaries)[bucket];
  const m = ((wa[day] ?? 0) & mask) >>> 0;
  return m !== 0 && m !== mask;
}

/** Free / busy for aggregate cells; null = no weeklyAvailability (excluded from counts and fit). */
export function bucketAggregateState(
  wa: WeeklyAvailabilityLike | null | undefined,
  day: WeekdayKey,
  bucket: BucketId,
  boundaries: AvailabilityBucketBoundariesLike
): 'free' | 'busy' | null {
  if (wa == null) return null;
  if (bucketIsFullFor(wa, day, bucket, boundaries) || bucketIsPartialFor(wa, day, bucket, boundaries)) {
    return 'free';
  }
  return 'busy';
}

/**
 * Fixture fit: every member must have stated availability and overlap the bucket.
 * Null weeklyAvailability does not count as available for planning.
 */
export function userFitsBucket(
  wa: WeeklyAvailabilityLike | null | undefined,
  day: WeekdayKey,
  bucket: BucketId,
  boundaries: AvailabilityBucketBoundariesLike
): boolean {
  if (wa == null) return false;
  const mask = buildBucketMasks(boundaries)[bucket];
  return (((wa[day] ?? 0) & mask) >>> 0) !== 0;
}
