/**
 * PRD 349 — rail caps and ordering.
 *
 * Deliberately free of prisma and env so both this rule and the privacy gate
 * can be unit-tested without a database.
 */

/** Find shows at most 10 live cards, Home at most 3 (PRD 349). */
export const LIVE_RAIL_FIND_LIMIT = 10;
export const LIVE_RAIL_HOME_LIMIT = 3;
/** Hard ceiling so a bad `limit` cannot turn the rail into a full city scan. */
export const LIVE_RAIL_MAX_LIMIT = 20;

export type LiveRailOrderable = {
  /** The viewer is PLAYING in this one — Find pins it first with a "You" tag. */
  viewerIsPlaying: boolean;
  /** Fixture of a league season the viewer takes part in. */
  followedSeason: boolean;
  /** ISO start time; ascending, so the longest-running match leads. */
  startTime: string;
};

/** Rail order: the viewer's own game, then followed-season fixtures, then start time. */
export function sortLiveRailGames<T extends LiveRailOrderable>(cards: T[]): T[] {
  return [...cards].sort((a, b) => {
    if (a.viewerIsPlaying !== b.viewerIsPlaying) return a.viewerIsPlaying ? -1 : 1;
    if (a.followedSeason !== b.followedSeason) return a.followedSeason ? -1 : 1;
    return a.startTime.localeCompare(b.startTime);
  });
}

/** Clamp a requested rail size into `[1, LIVE_RAIL_MAX_LIMIT]`. */
export function clampLiveRailLimit(raw: unknown, fallback = LIVE_RAIL_FIND_LIMIT): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.trunc(n), LIVE_RAIL_MAX_LIMIT));
}
