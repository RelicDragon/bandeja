import type { ChatContextType, ChatMessage } from '@/api/chat';
import { chatApi } from '@/api/chat';
import type { ChatOutboxRow } from './chatLocalDb';
import { chatLocalDb } from './chatLocalDb';
import {
  loadOutboxImageBlobs,
  loadOutboxVideoBlob,
  loadOutboxVideoPosterBlob,
  loadOutboxVoiceBlob,
} from './chatOutboxMediaBlobs';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { cancelSend } from '@/services/chatSendService';
import { CHAT_OUTBOX_REMOVED_EVENT, dispatchChatOutboxSuccess } from './chatOutboxEvents';
import { logChatOutboxBlobMismatch } from './chatDiagnostics';

export async function outboxRowHasLocalMediaBlobs(row: ChatOutboxRow): Promise<boolean> {
  const imgCount = row.pendingImageBlobCount ?? 0;
  if (imgCount > 0) {
    const blobs = await loadOutboxImageBlobs(row.tempId, imgCount);
    return blobs.length === imgCount;
  }
  if (row.hasPendingVideoBlob) {
    const vb = await loadOutboxVideoBlob(row.tempId);
    const pb = await loadOutboxVideoPosterBlob(row.tempId);
    return !!(vb && pb);
  }
  if (row.hasPendingVoiceBlob) {
    return !!(await loadOutboxVoiceBlob(row.tempId));
  }
  return true;
}

async function findLocalMessageByClientMutationId(
  row: ChatOutboxRow
): Promise<ChatMessage | undefined> {
  const cid = row.clientMutationId?.trim();
  if (!cid) return undefined;
  const rows = await chatLocalDb.messages
    .where('[contextType+contextId]')
    .equals([row.contextType, row.contextId])
    .toArray();
  const hit = rows.find(
    (r) => !r.deletedAt && (r.payload.clientMutationId?.trim() ?? '') === cid
  );
  return hit?.payload;
}

async function findRemoteMessageByClientMutationId(
  row: ChatOutboxRow
): Promise<ChatMessage | undefined> {
  const cid = row.clientMutationId?.trim();
  if (!cid) return undefined;
  try {
    let page: ChatMessage[] = [];
    if (row.contextType === 'GROUP') {
      page = await chatApi.getGroupChannelMessages(row.contextId, 1, 30);
    } else if (row.contextType === 'USER') {
      page = await chatApi.getUserChatMessages(row.contextId, 1, 30);
    } else if (row.contextType === 'BUG') {
      page = await chatApi.getBugMessages(row.contextId, 1, 30);
    } else {
      page = await chatApi.getMessages(row.contextType, row.contextId, 1, 30, row.payload.chatType);
    }
    return page.find((m) => (m.clientMutationId?.trim() ?? '') === cid);
  } catch {
    return undefined;
  }
}

/** Drop or complete outbox rows that cannot be sent (missing blobs) but already exist on server. */
export async function reconcileUnsendableOutboxRow(row: ChatOutboxRow): Promise<
  'ok' | 'removed' | 'needs_send'
> {
  const hasBlobs = await outboxRowHasLocalMediaBlobs(row);
  const needsUpload =
    (row.pendingImageBlobCount ?? 0) > 0 || row.hasPendingVideoBlob || row.hasPendingVoiceBlob;

  if (!needsUpload || hasBlobs) {
    return 'needs_send';
  }

  logChatOutboxBlobMismatch('reconcile', {
    tempId: row.tempId,
    contextType: row.contextType,
    contextId: row.contextId,
    kind: row.hasPendingVideoBlob ? 'video' : row.hasPendingVoiceBlob ? 'voice' : 'image',
  });

  let serverMsg = await findLocalMessageByClientMutationId(row);
  if (!serverMsg) {
    serverMsg = await findRemoteMessageByClientMutationId(row);
  }

  if (serverMsg) {
    cancelSend(row.tempId);
    await messageQueueStorage.remove(row.tempId, row.contextType, row.contextId);
    dispatchChatOutboxSuccess({
      tempId: row.tempId,
      contextType: row.contextType,
      contextId: row.contextId,
      message: serverMsg,
    });
    return 'ok';
  }

  cancelSend(row.tempId);
  await messageQueueStorage.remove(row.tempId, row.contextType, row.contextId);
  window.dispatchEvent(
    new CustomEvent(CHAT_OUTBOX_REMOVED_EVENT, {
      detail: {
        contextType: row.contextType,
        contextId: row.contextId,
        tempIds: [row.tempId],
      },
    })
  );
  return 'removed';
}

export async function reconcileOutboxForContext(
  contextType: ChatContextType,
  contextId: string
): Promise<void> {
  const rows = await messageQueueStorage.getByContext(contextType, contextId);
  for (const row of rows) {
    await reconcileUnsendableOutboxRow(row);
  }
}
