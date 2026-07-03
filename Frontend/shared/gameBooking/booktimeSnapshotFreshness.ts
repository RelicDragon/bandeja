/** Max age before a Booktime busy snapshot is treated as stale (epic #122: 60s). */
export const BOOKTIME_SNAPSHOT_FRESH_MS = 60 * 1000;

/** Max snapshot PUTs per user/club/date within {@link BOOKTIME_SNAPSHOT_FRESH_MS}. */
export const BOOKTIME_SNAPSHOT_PUT_MAX_PER_WINDOW = 10;

/** Min interval between global snapshot writes before server returns 429 (freshness / dedupe). */
export const BOOKTIME_SNAPSHOT_PUT_COOLDOWN_MS =
  BOOKTIME_SNAPSHOT_FRESH_MS / BOOKTIME_SNAPSHOT_PUT_MAX_PER_WINDOW;
