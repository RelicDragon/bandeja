import type { QueuedMessageEnqueue } from '@/services/chatMessageQueueStorage';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { registerOutboxEnqueue } from '../chatOutboxEnqueue';
import {
  compressChatOutboxImageBlob,
  compressChatOutboxImageBlobs,
} from '../chatOutboxImageCompress';
import { chatLocalDb, type ChatOutboxRow } from '../chatLocalDb';
import { sendWithTimeout, isSending } from '@/services/chatSendService';
import { purgeExpiredFailedOutbox } from '../chatOutboxExpiry';
import { CHAT_OUTBOX_FAILED_EVENT } from '../chatOutboxEvents';
import { recordChatSendMetric } from '../chatSendMetrics';
import { outboxRowHasLocalMediaBlobs, reconcileUnsendableOutboxRow } from '../chatOutboxReconcile';
import type { FlushOfflineIntentOptions, PendingOfflineIntent } from './types';

export type RetryChatOutboxOptions = {
  includeFailed?: boolean;
};

export async function enqueueSend(queued: QueuedMessageEnqueue): Promise<void> {
  let entry = queued;
  if (queued.pendingImageBlobs?.length) {
    const pendingImageBlobs = await compressChatOutboxImageBlobs(queued.pendingImageBlobs);
    entry = { ...queued, pendingImageBlobs };
  }
  if (queued.pendingVideoPosterBlob) {
    const pendingVideoPosterBlob = await compressChatOutboxImageBlob(queued.pendingVideoPosterBlob);
    entry = { ...entry, pendingVideoPosterBlob };
  }
  const ready = messageQueueStorage.add(entry);
  registerOutboxEnqueue(entry.tempId, ready);
  await ready;
}

function outboxCreatedAtMs(row: ChatOutboxRow): number {
  const t = Date.parse(row.createdAt);
  return Number.isFinite(t) ? t : 0;
}

export async function listPendingOutboxIntents(
  options?: FlushOfflineIntentOptions
): Promise<PendingOfflineIntent[]> {
  const includeFailed = options?.includeFailedOutbox ?? true;
  await purgeExpiredFailedOutbox();
  const rows = await chatLocalDb.outbox.toArray();
  const candidates = rows.filter((r) => {
    if (isSending(r.tempId)) return false;
    if (r.status === 'sending' || r.status === 'queued') return true;
    return includeFailed && r.status === 'failed';
  });

  const pending: PendingOfflineIntent[] = [];
  for (const row of candidates) {
    const outcome = await reconcileUnsendableOutboxRow(row);
    if (outcome !== 'needs_send') continue;
    pending.push({
      source: 'outbox',
      id: row.tempId,
      contextType: row.contextType,
      contextId: row.contextId,
      createdAtMs: outboxCreatedAtMs(row),
    });
  }
  return pending;
}

export async function flushOutboxIntent(tempId: string): Promise<void> {
  const row = await chatLocalDb.outbox.get(tempId);
  if (!row) return;
  if (isSending(row.tempId)) return;
  if (!(await outboxRowHasLocalMediaBlobs(row))) {
    await reconcileUnsendableOutboxRow(row);
    return;
  }

  recordChatSendMetric({ kind: 'chat_outbox_stuck_retry' });
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
      onFailed: (failedTempId) => {
        window.dispatchEvent(
          new CustomEvent(CHAT_OUTBOX_FAILED_EVENT, {
            detail: { tempId: failedTempId, contextType: row.contextType, contextId: row.contextId },
          })
        );
      },
    }
  );
}

export async function countFailedOutboxForContext(
  contextType: ChatOutboxRow['contextType'],
  contextId: string
): Promise<number> {
  const rows = await chatLocalDb.outbox
    .where('[contextType+contextId]')
    .equals([contextType, contextId])
    .toArray();
  return rows.filter((r) => r.status === 'failed').length;
}
