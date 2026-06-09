import type { ChatContextType, OptimisticMessagePayload } from '@/api/chat';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { consumeOutboxResumeSuppressed, isSending } from '@/services/chat/chatSendCoordinator';
import { reconcileAbortedChatSendIfDelivered } from '@/services/chat/chatOutboxReconcile';

export type DriveQueuedSendParams = {
  tempId: string;
  contextType: ChatContextType;
  contextId: string;
  payload: OptimisticMessagePayload;
  mediaUrls?: string[];
  thumbnailUrls?: string[];
  clientMutationId?: string;
};

export type DriveQueuedSend = (
  params: DriveQueuedSendParams,
  callbacks: { onFailed: (tempId: string) => void }
) => void;

/** After a superseded/cancelled attempt: reconcile server delivery or resume the outbox row. */
export async function resumeOrFailSupersededChatSend(
  tempId: string,
  contextType: ChatContextType,
  contextId: string,
  onFailed: (tempId: string) => void,
  driveSend: DriveQueuedSend
): Promise<void> {
  if (await reconcileAbortedChatSendIfDelivered(tempId, contextType, contextId)) return;
  if (consumeOutboxResumeSuppressed(tempId)) return;

  const row = await messageQueueStorage.getByTempId(tempId);
  if (!row || row.contextType !== contextType || row.contextId !== contextId) return;
  if (row.status !== 'queued' && row.status !== 'sending') return;
  if (isSending(tempId)) return;

  await messageQueueStorage.updateStatus(tempId, contextType, contextId, 'queued');
  driveSend(
    {
      tempId: row.tempId,
      contextType: row.contextType,
      contextId: row.contextId,
      payload: row.payload,
      mediaUrls: row.mediaUrls,
      thumbnailUrls: row.thumbnailUrls,
      clientMutationId: row.clientMutationId,
    },
    { onFailed }
  );
}
