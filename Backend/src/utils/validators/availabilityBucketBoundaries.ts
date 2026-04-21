import { ApiError } from '../ApiError';

export interface AvailabilityBucketBoundaries {
  night: number;
  morning: number;
  afternoon: number;
  evening: number;
}

const isInt0to23 = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 23;

export const validateAvailabilityBucketBoundaries = (
  value: unknown
): AvailabilityBucketBoundaries | null => {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'Invalid availabilityBucketBoundaries');
  }
  const o = value as Record<string, unknown>;
  const { night, morning, afternoon, evening } = o;
  if (!isInt0to23(night) || !isInt0to23(morning) || !isInt0to23(afternoon) || !isInt0to23(evening)) {
    throw new ApiError(400, 'Invalid availabilityBucketBoundaries hours');
  }
  if (!(night < morning && morning < afternoon && afternoon < evening)) {
    throw new ApiError(400, 'availabilityBucketBoundaries must satisfy night < morning < afternoon < evening');
  }
  return { night, morning, afternoon, evening };
};
