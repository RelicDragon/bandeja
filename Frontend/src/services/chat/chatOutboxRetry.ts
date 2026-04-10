import type { ChatContextType, ChatMessage } from '@/api/chat';
import { chatLocalDb } from './chatLocalDb';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { sendWithTimeout, isSending, cancelSend } from '@/services/chatSendService';
import { putLocalMessage } from './chatLocalApply';
import { purgeExpiredFailedOutbox } from './chatOutboxExpiry';
import { CHAT_OUTBOX_FAILED_EVENT, CHAT_OUTBOX_SUCCESS_EVENT } from './chatOutboxEvents';

export { CHAT_OUTBOX_FAILED_EVENT, CHAT_OUTBOX_SUCCESS_EVENT } from './chatOutboxEvents';

type OutboxSuccessDetail = {
  tempId: string;
  contextType: ChatContextType;
  contextId: string;
  message: ChatMessage;
};

let scheduleTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleRetryFailedChatOutbox(): void {
  if (scheduleTimer) clearTimeout(scheduleTimer);
  scheduleTimer = setTimeout(() => {
    scheduleTimer = null;
    void retryFailedChatOutbox();
  }, 450);
}

export async function retryFailedChatOutbox(): Promise<void> {
  await purgeExpiredFailedOutbox();
  const rows = await chatLocalDb.outbox.toArray();
  const resumable = rows.filter(
    (r) => r.status === 'failed' || (r.status === 'sending' && !isSending(r.tempId))
  );
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
