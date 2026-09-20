import type { GameCurrentCourt } from '@/api/gameWeather';

/**
 * PRD 357 — "Move indoor handles one court at a time".
 *
 * The sheet moves a single outdoor court, so the game's court set must come out
 * with that one court replaced and every other court untouched. Sending just
 * the chosen court would silently drop the rest of a multi-court game while the
 * sheet is still reading "1 of 2 courts outdoor".
 *
 * Which outdoor court moves: the first one in `gameCourts` order. The sheet only
 * ever offers one move at a time, so a game with two outdoor courts is moved by
 * repeating the flow — each pass swaps the next remaining outdoor court.
 *
 * @param currentCourts the game's courts, in order, from `GET /games/:id/indoor-alternatives`
 * @param targetCourtId the indoor court the organizer picked
 * @returns the full court id list to persist, in order, without duplicates
 */
export function planIndoorCourtSwap(
  currentCourts: readonly GameCurrentCourt[],
  targetCourtId: string,
): string[] {
  // No linked courts at all (court unknown): the chosen court *is* the set.
  if (currentCourts.length === 0) return [targetCourtId];
  // Nothing outdoor to move (not reachable from the risk banner, which only
  // opens for an outdoor game): swap the first court so the count is kept.
  const movedOut = currentCourts.find((court) => !court.isIndoor) ?? currentCourts[0];
  return [
    ...new Set(
      currentCourts.map((court) => (court.id === movedOut.id ? targetCourtId : court.id)),
    ),
  ];
}
