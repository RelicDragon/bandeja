import { ChatContextType } from '@/api/chat';
import { chatLocalDb, type ChatOutboxRow } from './chat/chatLocalDb';
import {
  deleteOutboxImageBlobSlots,
  deleteOutboxMediaBlobsForTempId,
  deleteOutboxVideoBlobs,
  deleteOutboxVoiceBlob,
} from './chat/chatOutboxMediaBlobs';
import { revokeOutboxRehydrateBlobUrls } from './chat/chatOutboxRehydrateUrls';
import { reconcileThreadIndexOutboxForContext } from './chat/chatThreadIndex';

export type QueuedMessageStatus = ChatOutboxRow['status'];
export type QueuedMessage = ChatOutboxRow;
export type QueuedMessageEnqueue = ChatOutboxRow & {
  pendingImageBlobs?: Blob[];
  pendingVoiceBlob?: Blob;
  pendingVideoBlob?: Blob;
  pendingVideoPosterBlob?: Blob;
};

async function flushOutboxToThreadIndex(contextType: ChatContextType, contextId: string): Promise<void> {
  await reconcileThreadIndexOutboxForContext(contextType, contextId);
}

export const messageQueueStorage = {
  async getByTempId(tempId: string): Promise<QueuedMessage | undefined> {
    return chatLocalDb.outbox.get(tempId);
  },

  async getByContext(contextType: ChatContextType, contextId: string): Promise<QueuedMessage[]> {
    const rows = await chatLocalDb.outbox
      .where('[contextType+contextId]')
      .equals([contextType, contextId])
      .toArray();
    rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return rows;
  },

  async add(queued: QueuedMessageEnqueue): Promise<void> {
    const { pendingImageBlobs, pendingVoiceBlob, pendingVideoBlob, pendingVideoPosterBlob, ...rest } =
      queued;
    const imageBlobsDefined = pendingImageBlobs?.filter((b): b is Blob => b instanceof Blob) ?? [];
    let pendingImageBlobCount = rest.pendingImageBlobCount ?? 0;
    let hasPendingVoiceBlob = !!rest.hasPendingVoiceBlob;
    let hasPendingVideoBlob = !!rest.hasPendingVideoBlob;
    if (imageBlobsDefined.length > 0) {
      pendingImageBlobCount = imageBlobsDefined.length;
    }
    if (pendingVoiceBlob) {
      hasPendingVoiceBlob = true;
    }
    if (pendingVideoBlob) {
      hasPendingVideoBlob = true;
    }
    const row: ChatOutboxRow = {
      ...rest,
      pendingImageBlobCount: pendingImageBlobCount > 0 ? pendingImageBlobCount : undefined,
      hasPendingVoiceBlob: hasPendingVoiceBlob || undefined,
      hasPendingVideoBlob: hasPendingVideoBlob || undefined,
    };
    const tid = rest.tempId;
    await chatLocalDb.transaction('rw', chatLocalDb.outbox, chatLocalDb.outboxMediaBlobs, async () => {
      if (imageBlobsDefined.length > 0) {
        for (let i = 0; i < imageBlobsDefined.length; i++) {
          const blob = imageBlobsDefined[i]!;
          await chatLocalDb.outboxMediaBlobs.put({
            id: `${tid}:img:${i}`,
            tempId: tid,
            slot: i,
            kind: 'image',
            blob,
          });
        }
      }
      if (pendingVoiceBlob) {
        await chatLocalDb.outboxMediaBlobs.put({
          id: `${tid}:voice`,
          tempId: tid,
          slot: -1,
          kind: 'voice',
          blob: pendingVoiceBlob,
        });
      }
      if (pendingVideoBlob) {
        await chatLocalDb.outboxMediaBlobs.put({
          id: `${tid}:video`,
          tempId: tid,
          slot: -2,
          kind: 'video',
          blob: pendingVideoBlob,
        });
      }
      if (pendingVideoPosterBlob) {
        await chatLocalDb.outboxMediaBlobs.put({
          id: `${tid}:video-poster`,
          tempId: tid,
          slot: -3,
          kind: 'video-poster',
          blob: pendingVideoPosterBlob,
        });
      }
      await chatLocalDb.outbox.put(row);
    });
    await flushOutboxToThreadIndex(row.contextType, row.contextId);
  },

  async updateStatus(
    tempId: string,
    _contextType: ChatContextType,
    _contextId: string,
    status: QueuedMessageStatus,
    mediaUrls?: string[],
    thumbnailUrls?: string[]
  ): Promise<void> {
    const row = await chatLocalDb.outbox.get(tempId);
    if (!row) return;
    await chatLocalDb.outbox.put({
      ...row,
      status,
      mediaUrls: mediaUrls ?? row.mediaUrls,
      thumbnailUrls: thumbnailUrls ?? row.thumbnailUrls,
    });
    await flushOutboxToThreadIndex(row.contextType, row.contextId);
  },

  async commitPendingImagesUploaded(
    tempId: string,
    mediaUrls: string[],
    thumbnailUrls: string[]
  ): Promise<void> {
    const row = await chatLocalDb.outbox.get(tempId);
    if (!row) return;
    const n = row.pendingImageBlobCount ?? 0;
    if (n > 0) await deleteOutboxImageBlobSlots(tempId, n);
    await chatLocalDb.outbox.put({
      ...row,
      pendingImageBlobCount: undefined,
      mediaUrls,
      thumbnailUrls,
      payload: { ...row.payload, mediaUrls, thumbnailUrls },
    });
    await flushOutboxToThreadIndex(row.contextType, row.contextId);
  },

  async commitPendingVideoUploaded(
    tempId: string,
    videoUrl: string,
    thumbnailUrl: string,
    videoDurationMs: number
  ): Promise<void> {
    const row = await chatLocalDb.outbox.get(tempId);
    if (!row) return;
    await deleteOutboxVideoBlobs(tempId);
    const mediaUrls = [videoUrl];
    const thumbnailUrls = [thumbnailUrl];
    await chatLocalDb.outbox.put({
      ...row,
      hasPendingVideoBlob: undefined,
      mediaUrls,
      thumbnailUrls,
      payload: {
        ...row.payload,
        mediaUrls,
        thumbnailUrls,
        messageType: 'VIDEO',
        videoDurationMs,
      },
    });
    await flushOutboxToThreadIndex(row.contextType, row.contextId);
  },

  async commitPendingVoiceUploaded(tempId: string, audioUrl: string): Promise<void> {
    const row = await chatLocalDb.outbox.get(tempId);
    if (!row) return;
    await deleteOutboxVoiceBlob(tempId);
    const mediaUrls = [audioUrl];
    await chatLocalDb.outbox.put({
      ...row,
      hasPendingVoiceBlob: undefined,
      mediaUrls,
      thumbnailUrls: row.thumbnailUrls,
      payload: { ...row.payload, mediaUrls, thumbnailUrls: row.thumbnailUrls ?? [] },
    });
    await flushOutboxToThreadIndex(row.contextType, row.contextId);
  },

  async remove(tempId: string, contextType?: ChatContextType, contextId?: string): Promise<void> {
    const row = await chatLocalDb.outbox.get(tempId);
    revokeOutboxRehydrateBlobUrls(tempId);
    await deleteOutboxMediaBlobsForTempId(tempId);
    await chatLocalDb.outbox.delete(tempId);
    const ct = row?.contextType ?? contextType;
    const cid = row?.contextId ?? contextId;
    if (ct && cid) {
      await flushOutboxToThreadIndex(ct, cid);
    }
  },

  async requeueSendingForContext(contextType: ChatContextType, contextId: string): Promise<string[]> {
    const rows = await this.getByContext(contextType, contextId);
    const requeued: string[] = [];
    for (const row of rows) {
      if (row.status !== 'sending') continue;
      await this.updateStatus(row.tempId, contextType, contextId, 'queued');
      requeued.push(row.tempId);
    }
    return requeued;
  },

  clearCache(): void {},
};
