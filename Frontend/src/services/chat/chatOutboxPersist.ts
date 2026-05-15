import type { QueuedMessageEnqueue } from '@/services/chatMessageQueueStorage';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { registerOutboxEnqueue } from '@/services/chat/chatOutboxEnqueue';
import {
  compressChatOutboxImageBlob,
  compressChatOutboxImageBlobs,
} from '@/services/chat/chatOutboxImageCompress';

/** Persist outbox row and block until Dexie write completes. */
export async function persistOptimisticOutbox(queued: QueuedMessageEnqueue): Promise<void> {
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
