import { dateKeyInTimezone } from '@/utils/weatherDayGroups';

/**
 * PRD 349 — Home shows the live rail **only when the viewer has no game of
 * their own today**. Home stays about the viewer; the rail is a fallback, not a
 * permanent fixture.
 *
 * "Today" is the viewer's city day, not the device day — a player in a
 * different timezone from their club must not see yesterday's game counted.
 */
export interface HomeLiveRailGame {
  startTime: string | Date;
  status?: string | null;
  entityType?: string | null;
}

/** Cancelled / archived games do not count as "a game today". */
const ACTIVE_STATUSES = new Set(['ANNOUNCED', 'STARTED', 'FINISHED']);

export function hasOwnGameToday(
  games: HomeLiveRailGame[] | undefined | null,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!games || games.length === 0) return false;
  const todayKey = dateKeyInTimezone(now, timezone);

  return games.some((game) => {
    if (game.entityType === 'LEAGUE_SEASON') return false;
    if (game.status && !ACTIVE_STATUSES.has(game.status)) return false;
    const start = game.startTime instanceof Date ? game.startTime : new Date(game.startTime);
    if (Number.isNaN(start.getTime())) return false;
    return dateKeyInTimezone(start, timezone) === todayKey;
  });
}

/** Home renders the rail only when the viewer's own day is empty. */
export function shouldShowHomeLiveRail(
  games: HomeLiveRailGame[] | undefined | null,
  timezone: string,
  now: Date = new Date(),
): boolean {
  return !hasOwnGameToday(games, timezone, now);
}
