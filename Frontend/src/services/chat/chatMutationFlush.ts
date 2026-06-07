import {
  canFlushMutations,
  dispatchMutationFlushDone,
  flushMutationIntent,
  listPendingMutationIntents,
} from './offlineIntent/mutationAdapter';

let flushRunning = false;
let scheduleTimer: ReturnType<typeof setTimeout> | null = null;

function runWithMutationFlushLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
  if (locks?.request) {
    return new Promise((resolve, reject) => {
      void locks.request('bandeja-chat-mutation-flush-v1', { mode: 'exclusive' }, async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        }
      });
    });
  }
  return fn();
}

export function scheduleChatMutationFlush(): void {
  if (scheduleTimer) clearTimeout(scheduleTimer);
  scheduleTimer = setTimeout(() => {
    scheduleTimer = null;
    void flushChatMutationQueue();
  }, 220);
}

export async function flushChatMutationQueue(): Promise<void> {
  if (!canFlushMutations()) return;

  await runWithMutationFlushLock(async () => {
    if (flushRunning) return;
    flushRunning = true;
    try {
      const pending = await listPendingMutationIntents();
      pending.sort((a, b) => a.createdAtMs - b.createdAtMs);
      for (const intent of pending) {
        await flushMutationIntent(intent.id);
      }
    } finally {
      flushRunning = false;
      dispatchMutationFlushDone();
    }
  });
}

export function scheduleRetryFailedChatMutations(): void {
  scheduleChatMutationFlush();
}
