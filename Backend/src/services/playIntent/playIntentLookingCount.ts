/**
 * PRD 363 — pure pieces of the "people looking to play" count.
 *
 * The count is one number per `(city, sport, discovery window)`: how many
 * distinct players have a live GAME intent for today (or today + tomorrow
 * after 18:00 city time) and are not already seated in a game on those days.
 * The viewer is subtracted per request, so the cached value is the list of
 * user ids, not a number.
 */

export const LOOKING_COUNT_CACHE_TTL_SECONDS = 60;

const CACHE_KEY_PREFIX = 'pp:play-intents:looking-count:v1';

export type LookingCountResult = {
  /** `null` while the admin flag is off; the client then renders nothing. */
  count: number | null;
  /** The discovery window the count covers, in the city's calendar. */
  dayKeys: string[];
};

/** One key per scope; the window is part of it so the 18:00 rollover never serves yesterday's window. */
export function lookingCountCacheKey(
  cityId: string,
  sport: string,
  dayKeys: readonly string[],
): string {
  return `${CACHE_KEY_PREFIX}:${cityId}:${sport}:${[...dayKeys].sort().join(',')}`;
}

/** Distinct ids, minus the viewer — the viewer's own intent is never "someone else looking". */
export function countLookingExcludingViewer(
  userIds: readonly string[],
  viewerUserId: string,
): number {
  const distinct = new Set(userIds);
  distinct.delete(viewerUserId);
  return distinct.size;
}

/** Defensive parse of a cached payload; anything but a string array is a miss. */
export function parseCachedLookingUserIds(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every((item) => typeof item === 'string')) return null;
    return parsed;
  } catch {
    return null;
  }
}
