import type { WeeklyAvailability, WeekdayKey, AvailabilityBucketBoundaries } from '@/types';
import {
  DAY_FULL,
  WEEKDAYS,
  WEEKEND_DAYS,
  WORKDAYS,
  fullWeek,
  emptyWeek,
} from './bitmask';
import { buildBucketMasks, type BucketId } from './bucketBoundaries';

export type { BucketId } from './bucketBoundaries';
export { BUCKET_ORDER } from './bucketBoundaries';

export type PresetId =
  | 'allDay'
  | 'weekdays'
  | 'weekends'
  | 'mornings'
  | 'afternoons'
  | 'evenings'
  | 'clear';

const applyAddMask = (
  wa: WeeklyAvailability,
  days: WeekdayKey[],
  mask: number
): WeeklyAvailability => {
  const next: WeeklyAvailability = { ...wa };
  for (const d of days) next[d] = (next[d] | mask) >>> 0;
  return next;
};

const applyRemoveMask = (
  wa: WeeklyAvailability,
  days: WeekdayKey[],
  mask: number
): WeeklyAvailability => {
  const next: WeeklyAvailability = { ...wa };
  for (const d of days) next[d] = (next[d] & ~mask) >>> 0;
  return next;
};

export const applyPreset = (
  wa: WeeklyAvailability,
  preset: PresetId,
  boundaries: AvailabilityBucketBoundaries,
  mode: 'replace' | 'add' | 'remove' = 'replace'
): WeeklyAvailability => {
  const masks = buildBucketMasks(boundaries);
  switch (preset) {
    case 'allDay':
      return mode === 'remove' ? emptyWeek() : fullWeek();
    case 'weekdays':
      if (mode === 'remove') return applyRemoveMask(wa, WORKDAYS, DAY_FULL);
      if (mode === 'add') return applyAddMask(wa, WORKDAYS, DAY_FULL);
      return {
        ...wa,
        mon: DAY_FULL, tue: DAY_FULL, wed: DAY_FULL, thu: DAY_FULL, fri: DAY_FULL,
        sat: 0, sun: 0, v: 1,
      };
    case 'weekends':
      if (mode === 'remove') return applyRemoveMask(wa, WEEKEND_DAYS, DAY_FULL);
      if (mode === 'add') return applyAddMask(wa, WEEKEND_DAYS, DAY_FULL);
      return {
        ...wa,
        mon: 0, tue: 0, wed: 0, thu: 0, fri: 0,
        sat: DAY_FULL, sun: DAY_FULL, v: 1,
      };
    case 'mornings': {
      const m = masks.morning;
      if (mode === 'remove') return applyRemoveMask(wa, WEEKDAYS, m);
      if (mode === 'add') return applyAddMask(wa, WEEKDAYS, m);
      const next = emptyWeek();
      return applyAddMask(next, WEEKDAYS, m);
    }
    case 'afternoons': {
      const m = masks.afternoon;
      if (mode === 'remove') return applyRemoveMask(wa, WEEKDAYS, m);
      if (mode === 'add') return applyAddMask(wa, WEEKDAYS, m);
      const next = emptyWeek();
      return applyAddMask(next, WEEKDAYS, m);
    }
    case 'evenings': {
      const m = masks.evening;
      if (mode === 'remove') return applyRemoveMask(wa, WEEKDAYS, m);
      if (mode === 'add') return applyAddMask(wa, WEEKDAYS, m);
      const next = emptyWeek();
      return applyAddMask(next, WEEKDAYS, m);
    }
    case 'clear':
      return emptyWeek();
    default:
      return wa;
  }
};

export const bucketIsFullFor = (
  wa: WeeklyAvailability,
  day: WeekdayKey,
  bucket: BucketId,
  boundaries: AvailabilityBucketBoundaries
): boolean => {
  const mask = buildBucketMasks(boundaries)[bucket];
  return (wa[day] & mask) === mask;
};

export const bucketIsPartialFor = (
  wa: WeeklyAvailability,
  day: WeekdayKey,
  bucket: BucketId,
  boundaries: AvailabilityBucketBoundaries
): boolean => {
  const mask = buildBucketMasks(boundaries)[bucket];
  const m = wa[day] & mask;
  return m !== 0 && m !== mask;
};

export const toggleBucket = (
  wa: WeeklyAvailability,
  day: WeekdayKey,
  bucket: BucketId,
  boundaries: AvailabilityBucketBoundaries
): WeeklyAvailability => {
  const mask = buildBucketMasks(boundaries)[bucket];
  const full = (wa[day] & mask) === mask;
  const next: WeeklyAvailability = { ...wa };
  next[day] = full ? (next[day] & ~mask) >>> 0 : (next[day] | mask) >>> 0;
  return next;
};
