import { isAxiosError } from 'axios';
import type { GameLevelEvaluationPlayer, GameLevelEvaluations } from '@/api/results';

const LOAD_RETRY_DELAYS_MS = [250, 750] as const;

export function isPlayerLevelFeedbackEnabled(
  rawValue: unknown = import.meta.env.VITE_PLAYER_LEVEL_FEEDBACK_ENABLED,
): boolean {
  if (typeof rawValue !== 'string') return true;
  return !['0', 'false', 'off'].includes(rawValue.trim().toLowerCase());
}

export function findNextUnansweredIndex(
  players: GameLevelEvaluationPlayer[],
  currentIndex: number,
): number | null {
  for (let offset = 1; offset < players.length; offset += 1) {
    const candidateIndex = (currentIndex + offset) % players.length;
    if (players[candidateIndex]?.verdict === null) return candidateIndex;
  }
  return null;
}

export function findNextFeedbackIndex(
  players: GameLevelEvaluationPlayer[],
  currentIndex: number,
  editingCompleteSet: boolean,
): number | null {
  if (editingCompleteSet) {
    return currentIndex < players.length - 1 ? currentIndex + 1 : null;
  }
  return findNextUnansweredIndex(players, currentIndex);
}

function shouldRetryLoad(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === undefined || status === 429 || status >= 500;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export async function loadLevelEvaluationsWithRetry(
  load: () => Promise<GameLevelEvaluations>,
  sleep: (ms: number) => Promise<void> = wait,
): Promise<GameLevelEvaluations> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await load();
    } catch (error) {
      const delay = LOAD_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !shouldRetryLoad(error)) throw error;
      await sleep(delay);
    }
  }
}
