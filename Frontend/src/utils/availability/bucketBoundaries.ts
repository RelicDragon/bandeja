import type { AvailabilityBucketBoundaries } from '@/types';
import { rangeMask } from './bitmask';

export type BucketId = 'night' | 'morning' | 'afternoon' | 'evening';

export const BUCKET_ORDER: BucketId[] = ['night', 'morning', 'afternoon', 'evening'];

export const DEFAULT_AVAILABILITY_BUCKET_BOUNDARIES: AvailabilityBucketBoundaries = {
  night: 0,
  morning: 6,
  afternoon: 12,
  evening: 18,
};

export const parseAvailabilityBucketBoundaries = (
  raw: unknown
): AvailabilityBucketBoundaries => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_AVAILABILITY_BUCKET_BOUNDARIES;
  }
  const o = raw as Record<string, unknown>;
  const night = o.night;
  const morning = o.morning;
  const afternoon = o.afternoon;
  const evening = o.evening;
  const ok = (x: unknown): x is number =>
    typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 23;
  if (!ok(night) || !ok(morning) || !ok(afternoon) || !ok(evening)) {
    return DEFAULT_AVAILABILITY_BUCKET_BOUNDARIES;
  }
  if (!(night < morning && morning < afternoon && afternoon < evening)) {
    return DEFAULT_AVAILABILITY_BUCKET_BOUNDARIES;
  }
  return { night, morning, afternoon, evening };
};

export const availabilityBucketBoundariesEqual = (
  a: AvailabilityBucketBoundaries,
  b: AvailabilityBucketBoundaries
): boolean =>
  a.night === b.night && a.morning === b.morning && a.afternoon === b.afternoon && a.evening === b.evening;

export const isDefaultAvailabilityBucketBoundaries = (
  b: AvailabilityBucketBoundaries
): boolean => availabilityBucketBoundariesEqual(b, DEFAULT_AVAILABILITY_BUCKET_BOUNDARIES);

export const buildBucketMasks = (
  b: AvailabilityBucketBoundaries
): Record<BucketId, number> => {
  const { night, morning, afternoon, evening } = b;
  return {
    night: rangeMask(night, morning) >>> 0,
    morning: rangeMask(morning, afternoon) >>> 0,
    afternoon: rangeMask(afternoon, evening) >>> 0,
    evening: ((rangeMask(evening, 24) | rangeMask(0, night)) >>> 0),
  };
};

const rangeInts = (lo: number, hi: number): number[] => {
  if (lo > hi) return [];
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
};

const hourChoicesFor = (b: AvailabilityBucketBoundaries, key: BucketId): number[] => {
  const { night, morning, afternoon, evening } = b;
  switch (key) {
    case 'night':
      return rangeInts(0, morning - 1);
    case 'morning':
      return rangeInts(night + 1, afternoon - 1);
    case 'afternoon':
      return rangeInts(morning + 1, evening - 1);
    case 'evening':
      return rangeInts(afternoon + 1, 23);
    default:
      return [];
  }
};

export const validHoursForBoundary = (
  b: AvailabilityBucketBoundaries,
  key: BucketId
): number[] => hourChoicesFor(b, key);

export const setBoundaryHour = (
  prev: AvailabilityBucketBoundaries,
  key: BucketId,
  hour: number
): AvailabilityBucketBoundaries => {
  const h = Math.max(0, Math.min(23, Math.floor(hour)));
  const choices = validHoursForBoundary(prev, key);
  const pick = choices.includes(h) ? h : (choices[0] ?? prev[key]);
  return clampChain({ ...prev, [key]: pick });
};

const clampChain = (b: AvailabilityBucketBoundaries): AvailabilityBucketBoundaries => {
  const night = Math.min(Math.max(0, b.night), 20);
  const morning = Math.min(Math.max(night + 1, b.morning), 21);
  const afternoon = Math.min(Math.max(morning + 1, b.afternoon), 22);
  const evening = Math.min(Math.max(afternoon + 1, b.evening), 23);
  return { night, morning, afternoon, evening };
};
