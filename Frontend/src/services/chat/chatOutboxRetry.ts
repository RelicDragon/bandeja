import {
  flushOutboxIntent,
  listPendingOutboxIntents,
  type RetryChatOutboxOptions,
} from './offlineIntent/outboxAdapter';

export { CHAT_OUTBOX_FAILED_EVENT, CHAT_OUTBOX_SUCCESS_EVENT } from './chatOutboxEvents';
export type { RetryChatOutboxOptions } from './offlineIntent/outboxAdapter';

let scheduleTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleRetryFailedChatOutbox(options?: RetryChatOutboxOptions): void {
  if (scheduleTimer) clearTimeout(scheduleTimer);
  const opts = options;
  scheduleTimer = setTimeout(() => {
    scheduleTimer = null;
    void retryFailedChatOutbox(opts);
  }, 450);
}

/** Resume in-flight outbox rows without re-driving explicit user-visible failures. */
export function scheduleRetryStuckChatOutbox(): void {
  scheduleRetryFailedChatOutbox({ includeFailed: false });
}

export async function retryFailedChatOutbox(options?: RetryChatOutboxOptions): Promise<void> {
  const includeFailed = options?.includeFailed ?? true;
  const pending = await listPendingOutboxIntents({ includeFailedOutbox: includeFailed });
  for (const intent of pending) {
    await flushOutboxIntent(intent.id);
  }
}
