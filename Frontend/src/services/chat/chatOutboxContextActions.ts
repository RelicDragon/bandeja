import type { ChatContextType, ChatMessage } from '@/api/chat';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { sendWithTimeout, isSending, cancelSend } from '@/services/chatSendService';
import { putLocalMessage } from '@/services/chat/chatLocalApply';
import {
  CHAT_OUTBOX_FAILED_EVENT,
  CHAT_OUTBOX_REMOVED_EVENT,
  CHAT_OUTBOX_SUCCESS_EVENT,
} from '@/services/chat/chatOutboxEvents';

export { CHAT_OUTBOX_REMOVED_EVENT } from '@/services/chat/chatOutboxEvents';

type RemovedDetail = {
  contextType: ChatContextType;
  contextId: string;
  tempIds: string[];
};

export async function retryFailedOutboxForContext(
  contextType: ChatContextType,
  contextId: string
): Promise<void> {
  const rows = await messageQueueStorage.getByContext(contextType, contextId);
  const failed = rows.filter((r) => r.status === 'failed');
  for (const row of failed) {
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
        onSuccess: (created: ChatMessage) => {
          void putLocalMessage(created);
          void messageQueueStorage.remove(row.tempId, row.contextType, row.contextId);
          cancelSend(row.tempId);
          window.dispatchEvent(
            new CustomEvent(CHAT_OUTBOX_SUCCESS_EVENT, {
              detail: {
                tempId: row.tempId,
                contextType: row.contextType,
                contextId: row.contextId,
                message: created,
              },
            })
          );
        },
      }
    );
  }
}

export async function dismissFailedOutboxForContext(
  contextType: ChatContextType,
  contextId: string
): Promise<void> {
  const rows = await messageQueueStorage.getByContext(contextType, contextId);
  const failed = rows.filter((r) => r.status === 'failed');
  if (failed.length === 0) return;
  const tempIds: string[] = [];
  for (const row of failed) {
    tempIds.push(row.tempId);
    cancelSend(row.tempId);
    await messageQueueStorage.remove(row.tempId, contextType, contextId);
  }
  const detail: RemovedDetail = { contextType, contextId, tempIds };
  window.dispatchEvent(new CustomEvent(CHAT_OUTBOX_REMOVED_EVENT, { detail }));
}
