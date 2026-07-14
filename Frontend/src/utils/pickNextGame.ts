import {
  NEXT_GAME_DISPLAY_POLICY,
  NEXT_GAME_LOOKBACK_MS,
} from '@shared/nextGame/policy';

export { NEXT_GAME_DISPLAY_POLICY, NEXT_GAME_LOOKBACK_MS };

export type NextGameCandidate = {
  id: string;
  startTime: string | Date;
  status: string;
};

/**
 * Displayable next game — widgets, `/next-game`, Assistant.
 * Policy: {@link NEXT_GAME_DISPLAY_POLICY}. Parity: `shared/nextGame/pickNextGameGolden.json`.
 */
export function pickNextGame<T extends NextGameCandidate>(
  games: T[],
  reference: Date = new Date(),
): T | undefined {
  const cutoffMs = reference.getTime() - NEXT_GAME_LOOKBACK_MS;
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
