import type { ChatContextType, ChatMessage } from '@/api/chat';
import { chatLocalDb } from './chatLocalDb';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { sendWithTimeout, isSending, cancelSend } from '@/services/chatSendService';
import { putLocalMessage } from './chatLocalApply';
import { purgeExpiredFailedOutbox } from './chatOutboxExpiry';
import { CHAT_OUTBOX_FAILED_EVENT, CHAT_OUTBOX_SUCCESS_EVENT } from './chatOutboxEvents';
import { recordChatSendMetric } from './chatSendMetrics';
import { outboxRowHasLocalMediaBlobs, reconcileUnsendableOutboxRow } from './chatOutboxReconcile';

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
  await purgeExpiredFailedOutbox();
  const rows = await chatLocalDb.outbox.toArray();
  const candidates = rows.filter((r) => {
    if (isSending(r.tempId)) return false;
    if (r.status === 'sending' || r.status === 'queued') return true;
    return includeFailed && r.status === 'failed';
  });

  const resumable: typeof candidates = [];
  for (const row of candidates) {
    const outcome = await reconcileUnsendableOutboxRow(row);
    if (outcome === 'needs_send') resumable.push(row);
  }

  if (resumable.length === 0) return;

  recordChatSendMetric({ kind: 'chat_outbox_stuck_retry' });

  for (const row of resumable) {
    if (isSending(row.tempId)) continue;
    if (!(await outboxRowHasLocalMediaBlobs(row))) {
      await reconcileUnsendableOutboxRow(row);
      continue;
    }
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
