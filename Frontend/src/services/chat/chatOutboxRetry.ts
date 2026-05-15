import type { ChatContextType, ChatMessage } from '@/api/chat';
import { chatLocalDb } from './chatLocalDb';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { sendWithTimeout, isSending, cancelSend } from '@/services/chatSendService';
import { putLocalMessage } from './chatLocalApply';
import { purgeExpiredFailedOutbox } from './chatOutboxExpiry';
import { CHAT_OUTBOX_FAILED_EVENT, CHAT_OUTBOX_SUCCESS_EVENT } from './chatOutboxEvents';
import { recordChatSendMetric } from './chatSendMetrics';

export { CHAT_OUTBOX_FAILED_EVENT, CHAT_OUTBOX_SUCCESS_EVENT } from './chatOutboxEvents';

type OutboxSuccessDetail = {
  tempId: string;
  contextType: ChatContextType;
  contextId: string;
  message: ChatMessage;
};

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

export type RetryChatOutboxOptions = {
  /** When false, only resume orphaned `sending` / `queued` rows (avoids tight loops on hard failures). */
  includeFailed?: boolean;
};

export async function retryFailedChatOutbox(options?: RetryChatOutboxOptions): Promise<void> {
  const includeFailed = options?.includeFailed ?? true;
  recordChatSendMetric({ kind: 'chat_outbox_stuck_retry' });
  await purgeExpiredFailedOutbox();
  const rows = await chatLocalDb.outbox.toArray();
  const resumable = rows.filter((r) => {
    if (isSending(r.tempId)) return false;
    if (r.status === 'sending' || r.status === 'queued') return true;
    return includeFailed && r.status === 'failed';
  });
  for (const row of resumable) {
    if (isSending(row.tempId)) continue;
    await messageQueueStorage.updateStatus(row.tempId, row.contextType, row.contextId, 'queued');
    sendWithTimeout(
      {
        tempId: row.tempId,
        contextType: row.contextType,
        contextId: row.contextId,
        payload: row.payload,
        mediaUrls: row.mediaUrls,
        thumbnailUrls: row.thumbnailUrls,
        clientMutationId: row.clientMutationId,
      },
      {
        onFailed: (tempId) => {
          window.dispatchEvent(
            new CustomEvent(CHAT_OUTBOX_FAILED_EVENT, {
              detail: { tempId, contextType: row.contextType, contextId: row.contextId },
            })
          );
        },
        onSuccess: (created) => {
          void putLocalMessage(created);
          void messageQueueStorage.remove(row.tempId, row.contextType, row.contextId);
          cancelSend(row.tempId);
          const detail: OutboxSuccessDetail = {
            tempId: row.tempId,
            contextType: row.contextType,
            contextId: row.contextId,
            message: created,
          };
          window.dispatchEvent(new CustomEvent(CHAT_OUTBOX_SUCCESS_EVENT, { detail }));
        },
      }
    );
  }
}
