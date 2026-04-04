import { flushChatMutationQueue } from './chatMutationFlush';
import { retryFailedChatOutbox } from './chatOutboxRetry';

let unifiedTimer: ReturnType<typeof setTimeout> | null = null;

export async function flushAllChatOfflineQueues(): Promise<void> {
  await flushChatMutationQueue();
  await retryFailedChatOutbox();
}

export function scheduleUnifiedChatOfflineFlush(): void {
  if (unifiedTimer) clearTimeout(unifiedTimer);
  unifiedTimer = setTimeout(() => {
    unifiedTimer = null;
    void flushAllChatOfflineQueues();
  }, 320);
}
