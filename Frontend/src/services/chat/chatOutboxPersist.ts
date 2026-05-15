import type { QueuedMessageEnqueue } from '@/services/chatMessageQueueStorage';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { registerOutboxEnqueue } from '@/services/chat/chatOutboxEnqueue';
import { compressChatOutboxImageBlobs } from '@/services/chat/chatOutboxImageCompress';

/** Persist outbox row and block until Dexie write completes. */
export async function persistOptimisticOutbox(queued: QueuedMessageEnqueue): Promise<void> {
  let entry = queued;
  if (queued.pendingImageBlobs?.length) {
    const pendingImageBlobs = await compressChatOutboxImageBlobs(queued.pendingImageBlobs);
    entry = { ...queued, pendingImageBlobs };
  }
  const ready = messageQueueStorage.add(entry);
  registerOutboxEnqueue(entry.tempId, ready);
  await ready;
}
