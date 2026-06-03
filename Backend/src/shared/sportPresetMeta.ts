import type { Sport } from '../sport/sportIds';

/** Keep in sync with Frontend/shared/sportPresetMeta.ts */
export type StrictValidationId =
  | 'NONE'
  | 'BWF_21'
  | 'BWF_15'
  | 'PICKLEBALL_RALLY_11'
  | 'CLASSIC_TIMED_RELAXED';

const STRICT_BY_SPORT_PRESET: Partial<Record<Sport, Partial<Record<string, StrictValidationId>>>> = {
  BADMINTON: {
    BEST_OF_3_21: 'BWF_21',
    BEST_OF_3_15: 'BWF_15',
    POINTS_21: 'NONE',
    POINTS_15: 'NONE',
  },
  PICKLEBALL: {
    BEST_OF_3_11: 'PICKLEBALL_RALLY_11',
    POINTS_16: 'NONE',
    POINTS_21: 'NONE',
    POINTS_24: 'NONE',
    POINTS_32: 'NONE',
  },
  TENNIS: {
    CLASSIC_TIMED: 'CLASSIC_TIMED_RELAXED',
    CLASSIC_SINGLE_SET: 'CLASSIC_TIMED_RELAXED',
  },
  PADEL: {
    CLASSIC_TIMED: 'CLASSIC_TIMED_RELAXED',
  },
};

export function getStrictValidationForPreset(
  sport: Sport | string | null | undefined,
  preset: string | null | undefined
): StrictValidationId {
  if (!preset) return 'NONE';
  const sportKey = sport as Sport | undefined;
  if (sportKey && STRICT_BY_SPORT_PRESET[sportKey]?.[preset]) {
    return STRICT_BY_SPORT_PRESET[sportKey]![preset]!;
  }
  return 'NONE';
}
