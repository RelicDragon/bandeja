/**
 * PRD 347 — pick the queued player auto-fill should seat.
 *
 * Queue order is `joinedAt` ascending (there is no order column — see
 * `GameReadService.computeJoinQueuesFromParticipants`). The first candidate who
 * passes the gates wins; if nobody passes, auto-fill falls through and the
 * normal spot-opened notifications go out instead.
 */
export interface AutoFillCandidate {
  userId: string;
  joinedAt: Date | string;
}

/** Orders a raw queue read the way the UI orders it. */
export function orderQueueByJoinedAt<T extends AutoFillCandidate>(queue: T[]): T[] {
  return [...queue].sort(
    (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
  );
}

/**
 * Walks the queue in order and returns the first user the gate check accepts.
 *
 * `isEligible` carries the real gender/level gates; it may reject (resolve
 * `false`) or throw — a throw is treated exactly like a rejection so one
 * malformed profile cannot abort the whole fill.
 */
export async function selectAutoFillCandidate<T extends AutoFillCandidate>(
  queue: T[],
  isEligible: (candidate: T) => Promise<boolean>,
): Promise<T | null> {
  for (const candidate of orderQueueByJoinedAt(queue)) {
    let eligible = false;
    try {
      eligible = await isEligible(candidate);
    } catch {
      eligible = false;
    }
    if (eligible) return candidate;
  }
  return null;
}
