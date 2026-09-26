/**
 * PRD 349 — rail caps and ordering.
 *
 * Deliberately free of prisma and env so both this rule and the privacy gate
 * can be unit-tested without a database.
 */

/** Find shows at most 10 cards, Home at most 3 (PRD 349). */
export const LIVE_RAIL_FIND_LIMIT = 10;
export const LIVE_RAIL_HOME_LIMIT = 3;
/** Hard ceiling so a bad `limit` cannot turn the rail into a full city scan. */
export const LIVE_RAIL_MAX_LIMIT = 20;

export type LiveRailPhase = 'live' | 'inProgress' | 'finished';

export type LiveRailOrderable = {
  /** `live` cards lead, then `inProgress` (no live score), then today's `finished`. */
  phase?: LiveRailPhase;
  /** The viewer is PLAYING in this one — Find pins it first with a "You" tag. */
  viewerIsPlaying: boolean;
  /** Fixture of a league season the viewer takes part in. */
  followedSeason: boolean;
  /** Any league fixture — accented on the card, and ahead of casual games. */
  league?: unknown;
  /** Someone the viewer follows is PLAYING in it. */
  followingPlaying?: boolean;
  /** ISO start time; ascending for live, so the longest-running match leads. */
  startTime: string;
  /** ISO time results went final; descending, so the freshest result leads. */
  finishedAt?: string | null;
};

const PHASE_RANK: Record<LiveRailPhase, number> = { live: 0, inProgress: 1, finished: 2 };

/**
 * Rail order. Live, then in progress without a live score, then finished;
 * inside each phase the viewer's own game, then fixtures of seasons they play
 * in, then any other league fixture, then games someone they follow is
 * playing, then the rest. Ties break on start time (longest-running first),
 * finished ties on finish time (most recent first).
 */
export function sortLiveRailGames<T extends LiveRailOrderable>(cards: T[]): T[] {
  return [...cards].sort((a, b) => {
    const aPhase = PHASE_RANK[a.phase ?? 'live'];
    const bPhase = PHASE_RANK[b.phase ?? 'live'];
    if (aPhase !== bPhase) return aPhase - bPhase;
    if (a.viewerIsPlaying !== b.viewerIsPlaying) return a.viewerIsPlaying ? -1 : 1;
    if (a.followedSeason !== b.followedSeason) return a.followedSeason ? -1 : 1;
    const aLeague = Boolean(a.league);
    const bLeague = Boolean(b.league);
    if (aLeague !== bLeague) return aLeague ? -1 : 1;
    const aFollowing = Boolean(a.followingPlaying);
    const bFollowing = Boolean(b.followingPlaying);
    if (aFollowing !== bFollowing) return aFollowing ? -1 : 1;
    if (a.phase === 'finished') return (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '');
    return a.startTime.localeCompare(b.startTime);
  });
}

/**
 * Sorted and capped — but the cap never drops a league fixture or the viewer's
 * own game in favour of a casual one. League games matter to the whole
 * community, so a busy evening of casual live games cannot push a finished
 * fixture off Home's three slots.
 */
export function selectLiveRailGames<T extends LiveRailOrderable>(cards: T[], limit: number): T[] {
  const sorted = sortLiveRailGames(cards);
  if (sorted.length <= limit) return sorted;
  const kept = new Set<T>();
  for (const card of sorted) {
    if (kept.size < limit && (card.viewerIsPlaying || Boolean(card.league))) kept.add(card);
  }
  for (const card of sorted) {
    if (kept.size >= limit) break;
    kept.add(card);
  }
  return sorted.filter((card) => kept.has(card));
}

/** Clamp a requested rail size into `[1, LIVE_RAIL_MAX_LIMIT]`. */
export function clampLiveRailLimit(raw: unknown, fallback = LIVE_RAIL_FIND_LIMIT): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.trunc(n), LIVE_RAIL_MAX_LIMIT));
}
