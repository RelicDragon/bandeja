import type { Game } from '@/types';

/**
 * PRD 347 — how long a freed seat stays "just opened".
 *
 * Mirror of `Backend/src/services/gameSeat/spotOpenedWindow.ts`. The backend
 * only sends `spotOpenedAt` while it is inside the window, but the card can
 * outlive that response in a cached list, so the client re-checks.
 */
export const SPOT_OPENED_WINDOW_MS = 2 * 60 * 60 * 1000;

/** One pulse cycle of the pill's dot, in milliseconds. */
export const SPOT_OPENED_PULSE_CYCLE_MS = 1200;

/** The pill's dot pulses for exactly two cycles, then holds still. */
export const SPOT_OPENED_PULSE_CYCLES = 2;

/** One-shot shimmer on the join button when the pill first paints. */
export const SPOT_OPENED_SHIMMER_MS = 240;

export function isWithinSpotOpenedWindow(
  openedAt: string | Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!openedAt) return false;
  const ms = openedAt instanceof Date ? openedAt.getTime() : new Date(openedAt).getTime();
  if (!Number.isFinite(ms)) return false;
  const elapsed = now - ms;
  return elapsed >= 0 && elapsed <= SPOT_OPENED_WINDOW_MS;
}

export type SpotOpenedGame = Pick<
  Game,
  'spotOpenedAt' | 'lastSeatOpenedAt' | 'resultsStatus'
> &
  Partial<Pick<Game, 'participants' | 'maxParticipants'>>;

/**
 * True when the roster has since been filled back up.
 *
 * `lastSeatOpenedAt` is never cleared, so with `autoFillFromQueue` on the seat
 * is taken again within a second and the game is full — the pill must go with
 * it, or Find boosts a full game to the top of its day group for two hours.
 *
 * Fails **open**: a card without a roster (or without `maxParticipants`) keeps
 * the pill rather than losing it to a missing field.
 */
function rosterIsFullAgain(game: SpotOpenedGame): boolean {
  const max = game.maxParticipants;
  if (typeof max !== 'number' || max <= 0) return false;
  const participants = game.participants;
  if (!Array.isArray(participants)) return false;
  const playing = participants.filter((p) => p?.status === 'PLAYING').length;
  return playing >= max;
}

/** The timestamp that drives the pill, or `null` when there is nothing to show. */
export function resolveSpotOpenedAt(
  game: SpotOpenedGame,
  now: number = Date.now(),
): string | null {
  // A locked roster never shows the pill, whatever the timestamp says.
  if (game.resultsStatus && game.resultsStatus !== 'NONE') return null;
  if (rosterIsFullAgain(game)) return null;
  const candidate = game.spotOpenedAt ?? game.lastSeatOpenedAt ?? null;
  return isWithinSpotOpenedWindow(candidate, now) ? candidate : null;
}

export function hasOpenSpotHighlight(
  game: SpotOpenedGame,
  now: number = Date.now(),
): boolean {
  return resolveSpotOpenedAt(game, now) !== null;
}

/**
 * Day-group ordering: cards with a live "Spot opened" pill float to the top of
 * their day.
 *
 * A **stable partition**, not a re-sort. The caller already decided the order
 * inside a day — ascending by start time on Find and Home, *descending* for the
 * finished list on Home — and this must preserve it inside both bands.
 * `Array.prototype.sort` is stable, and the comparator only ever compares the
 * boost, so equal elements keep their input order.
 *
 * This is the **only** place the boost is applied: the backend deliberately
 * does not reorder, so Find, Home and My Tab agree by sharing this helper.
 * `Frontend/src/components/home/UpcomingGamesList.tsx` keeps a private copy of
 * `groupGamesByDate`; it calls this too, and the two must not drift.
 */
export function sortDayGroupGames<T extends Game>(games: T[], now: number = Date.now()): T[] {
  return [...games].sort(
    (a, b) =>
      (hasOpenSpotHighlight(a, now) ? 0 : 1) - (hasOpenSpotHighlight(b, now) ? 0 : 1),
  );
}
