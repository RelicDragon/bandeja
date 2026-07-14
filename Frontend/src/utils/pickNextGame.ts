export type NextGameCandidate = {
  id: string;
  startTime: string | Date;
  status: string;
};

/** Soonest non-finished/archived game starting after now−1h (matches Watch widget). O(n). */
export function pickNextGame<T extends NextGameCandidate>(
  games: T[],
  reference: Date = new Date(),
): T | undefined {
  const cutoffMs = reference.getTime() - 3600 * 1000;
  let best: T | undefined;
  let bestStartMs = Number.POSITIVE_INFINITY;

  for (const game of games) {
    if (game.status === 'FINISHED' || game.status === 'ARCHIVED') continue;
    const startMs = new Date(game.startTime).getTime();
    if (!Number.isFinite(startMs) || startMs <= cutoffMs) continue;
    if (startMs < bestStartMs) {
      best = game;
      bestStartMs = startMs;
    }
  }

  return best;
}
