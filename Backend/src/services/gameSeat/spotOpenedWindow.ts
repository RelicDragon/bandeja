/**
 * PRD 347 — how long a freed seat stays "just opened".
 *
 * The same window drives three surfaces and they must never disagree:
 * the Find/Home "Spot opened" pill, the day-group sort boost, and the
 * `spotOpenedAt` card enrichment. Keep it here, import it everywhere.
 *
 * The frontend mirror is `Frontend/src/features/spot-opened/spotOpenedWindow.ts`.
 */
export const SPOT_OPENED_WINDOW_MS = 2 * 60 * 60 * 1000;

/** `true` while `openedAt` is inside the 2 h window ending at `now`. */
export function isWithinSpotOpenedWindow(
  openedAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!openedAt) return false;
  const opened = openedAt instanceof Date ? openedAt : new Date(openedAt);
  const ms = opened.getTime();
  if (!Number.isFinite(ms)) return false;
  const elapsed = now.getTime() - ms;
  return elapsed >= 0 && elapsed <= SPOT_OPENED_WINDOW_MS;
}
