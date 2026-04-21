import { ApiError } from '../ApiError';

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_MASK_MAX = 0xffffff;

export interface WeeklyAvailability {
  mon: number;
  tue: number;
  wed: number;
  thu: number;
  fri: number;
  sat: number;
  sun: number;
  v: 1;
}

export const validateWeeklyAvailability = (
  value: unknown
): WeeklyAvailability | null => {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'Invalid weeklyAvailability');
  }
  const obj = value as Record<string, unknown>;
  if (obj.v !== 1) {
    throw new ApiError(400, 'Invalid weeklyAvailability schema version');
  }
  const out: Partial<WeeklyAvailability> = { v: 1 };
  for (const day of DAY_KEYS) {
    const raw = obj[day];
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > DAY_MASK_MAX) {
      throw new ApiError(400, `Invalid weeklyAvailability.${day}`);
    }
    out[day] = raw;
  }
  return out as WeeklyAvailability;
};
