import { flushChatMutationQueue } from './chatMutationFlush';
import { retryFailedChatOutbox } from './chatOutboxRetry';
import { requestChatOfflineBackgroundSync } from './chatBackgroundSyncRegister';

const UNIFIED_OFFLINE_FLUSH_LOCK = 'bandeja-chat-unified-offline-flush-v1';

let unifiedTimer: ReturnType<typeof setTimeout> | null = null;

function runWithUnifiedOfflineFlushLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
  if (locks?.request) {
    return new Promise((resolve, reject) => {
      void locks.request(UNIFIED_OFFLINE_FLUSH_LOCK, { mode: 'exclusive' }, async () => {
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

export async function flushAllChatOfflineQueues(): Promise<void> {
  await runWithUnifiedOfflineFlushLock(async () => {
    await flushChatMutationQueue();
    await retryFailedChatOutbox();
  });
}

export function scheduleUnifiedChatOfflineFlush(): void {
  requestChatOfflineBackgroundSync();
  if (unifiedTimer) clearTimeout(unifiedTimer);
  unifiedTimer = setTimeout(() => {
    unifiedTimer = null;
    void flushAllChatOfflineQueues();
  }, 320);
}
