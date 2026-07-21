import { ApiError } from '../../utils/ApiError';

export type LeaderboardGenderFilter = 'MALE' | 'FEMALE' | null;

const ALL_VALUES = new Set(['all', 'ALL', '']);
const MEN_VALUES = new Set(['men', 'MALE']);
const WOMEN_VALUES = new Set(['women', 'FEMALE']);

function firstQueryString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value.find((v) => typeof v === 'string');
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
}

/** Parse `?gender=` for leaderboard. `null` = all genders. */
export function resolveLeaderboardGenderFilter(genderQuery: unknown): LeaderboardGenderFilter {
  const raw = firstQueryString(genderQuery);
  if (raw === undefined || ALL_VALUES.has(raw)) return null;
  if (MEN_VALUES.has(raw)) return 'MALE';
  if (WOMEN_VALUES.has(raw)) return 'FEMALE';
  throw new ApiError(400, 'Invalid gender. Must be all, men, or women');
}
