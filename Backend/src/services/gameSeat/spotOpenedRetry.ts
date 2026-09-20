/**
 * PRD 347 — retry-with-backoff for a spot-opened send.
 *
 * Kept free of Prisma and of the notification stack so it can be unit-tested
 * without a database, and so a retry policy change is one small diff.
 */
export const SPOT_OPENED_RETRY_DELAYS_MS = [1_000, 4_000] as const;

export interface SendAttemptResult {
  delivered: boolean;
  /** Retrying cannot help (no channel linked, blocked bot, preferences off). */
  permanent?: boolean;
}

export type SleepFn = (ms: number) => Promise<void>;

const realSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `attempt` on the fixed backoff schedule, stopping early on success or
 * on a permanent failure. Never throws — a notification problem must never
 * surface inside the join or leave request that triggered it.
 */
export async function sendWithBackoff(
  attempt: () => Promise<SendAttemptResult>,
  delaysMs: readonly number[] = SPOT_OPENED_RETRY_DELAYS_MS,
  sleep: SleepFn = realSleep,
): Promise<SendAttemptResult> {
  let last: SendAttemptResult = { delivered: false };
  for (let i = 0; i <= delaysMs.length; i += 1) {
    try {
      last = await attempt();
    } catch (error) {
      console.error('[spotOpened] send attempt threw', error);
      last = { delivered: false };
    }
    if (last.delivered || last.permanent) return last;
    if (i < delaysMs.length) await sleep(delaysMs[i]);
  }
  return last;
}
