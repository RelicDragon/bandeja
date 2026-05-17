/** Mirrors Frontend `utils/availability` bitmask rules for league planner. */

import { weeklyDocHasConfiguredSlots } from '../../utils/weeklyAvailabilityRolling';

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface WeeklyAvailabilityLike {
  mon?: number;
  tue?: number;
  wed?: number;
  thu?: number;
  fri?: number;
  sat?: number;
  sun?: number;
}

export const WEEKDAY_FROM_SHORT: Record<string, WeekdayKey> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
};

export const PLANNER_HOURS = Array.from({ length: 24 }, (_, h) => h);

export function getHour(mask: number, hour: number): boolean {
  return ((mask >>> hour) & 1) === 1;
}

/** True when the user saved at least one available hour (v1 or rolling v2). */
export function weeklyAvailabilityHasConfiguredSlots(wa: unknown): boolean {
  return weeklyDocHasConfiguredSlots(wa);
}

/** Free / busy for aggregate cells; null = no saved weekly availability (excluded from counts and fit). */
export function hourAggregateState(
  wa: WeeklyAvailabilityLike | null | undefined,
  day: WeekdayKey,
  hour: number
): 'free' | 'busy' | null {
  if (wa == null || !weeklyAvailabilityHasConfiguredSlots(wa)) return null;
  return getHour(wa[day] ?? 0, hour) ? 'free' : 'busy';
}

/**
 * Fixture fit: every member must be available in this hour; users with no saved weekly slots are excluded.
 */
export function userFitsHour(
  wa: WeeklyAvailabilityLike | null | undefined,
  day: WeekdayKey,
  hour: number
): boolean {
  if (wa == null || !weeklyAvailabilityHasConfiguredSlots(wa)) return false;
  return getHour(wa[day] ?? 0, hour);
}
