import { get, set } from 'idb-keyval';
import { ChatContextType, OptimisticMessagePayload } from '@/api/chat';

const DB_PREFIX = 'padelpulse-message-queue';

export type QueuedMessageStatus = 'queued' | 'sending' | 'failed';

export interface QueuedMessage {
  tempId: string;
  contextType: ChatContextType;
  contextId: string;
  payload: OptimisticMessagePayload;
  createdAt: string;
  status: QueuedMessageStatus;
  mediaUrls?: string[];
  thumbnailUrls?: string[];
}

function key(contextType: ChatContextType, contextId: string): string {
  return `${DB_PREFIX}:${contextType}:${contextId}`;
}

const cache = new Map<string, QueuedMessage[]>();

export const messageQueueStorage = {
  async getByContext(contextType: ChatContextType, contextId: string): Promise<QueuedMessage[]> {
    const k = key(contextType, contextId);
    if (cache.has(k)) return cache.get(k)!;
    const list = await get<QueuedMessage[]>(k);
    const result = list ?? [];
    cache.set(k, result);
    return result;
  },

  async add(queued: QueuedMessage): Promise<void> {
    const list = await this.getByContext(queued.contextType, queued.contextId);
    const next = [...list, queued];
    await set(key(queued.contextType, queued.contextId), next);
    cache.set(key(queued.contextType, queued.contextId), next);
  },

  async updateStatus(
    tempId: string,
    contextType: ChatContextType,
    contextId: string,
    status: QueuedMessageStatus,
    mediaUrls?: string[],
    thumbnailUrls?: string[]
  ): Promise<void> {
    const list = await this.getByContext(contextType, contextId);
    const idx = list.findIndex((m) => m.tempId === tempId);
    if (idx < 0) return;
    const next = list.map((m, i) =>
      i === idx ? { ...m, status, mediaUrls: mediaUrls ?? m.mediaUrls, thumbnailUrls: thumbnailUrls ?? m.thumbnailUrls } : m
    );
    await set(key(contextType, contextId), next);
    cache.set(key(contextType, contextId), next);
  },

  async remove(tempId: string, contextType: ChatContextType, contextId: string): Promise<void> {
    const list = await this.getByContext(contextType, contextId);
    const next = list.filter((m) => m.tempId !== tempId);
    await set(key(contextType, contextId), next);
    cache.set(key(contextType, contextId), next);
  },

  clearCache(): void {
    cache.clear();
  },
};
