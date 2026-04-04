import Dexie, { type Table } from 'dexie';
import type { ChatContextType, ChatMessage, ChatType, OptimisticMessagePayload } from '@/api/chat';

export type ChatLocalRow = {
  id: string;
  contextType: ChatContextType;
  contextId: string;
  chatType: ChatType;
  createdAt: number;
  deletedAt?: number;
  payload: ChatMessage;
};

export type ChatLocalCursorRow = {
  key: string;
  lastAppliedSeq: number;
  updatedAt: number;
};

export type QueuedMessageStatus = 'queued' | 'sending' | 'failed';

export type ChatOutboxRow = {
  tempId: string;
  contextType: ChatContextType;
  contextId: string;
  payload: OptimisticMessagePayload;
  createdAt: string;
  status: QueuedMessageStatus;
  mediaUrls?: string[];
  thumbnailUrls?: string[];
  clientMutationId?: string;
  /** Pending images stored in `outboxMediaBlobs` (IndexedDB), not inline. */
  pendingImageBlobCount?: number;
  /** Pending voice audio blob in `outboxMediaBlobs` until upload+ACK. */
  hasPendingVoiceBlob?: boolean;
};

export type OutboxMediaBlobRow = {
  id: string;
  tempId: string;
  slot: number;
  kind: 'image' | 'voice';
  blob: Blob;
};

export type ChatThreadMetaRow = {
  key: string;
  serverMaxSeq: number;
  updatedAt: number;
  lastPullStartedAt?: number;
  lastSuccessfulPullAt?: number;
  nextRetryAt?: number;
  pullErrorAt?: number;
  /** Phase C3: last time user opened this thread (ms). */
  lastOpenedAt?: number;
  /** Phase C3: number of opens (incremented on focus). */
  openCount?: number;
  /** GAME only: last focused chat tab for missed-message fetch. */
  lastGameChatType?: ChatType;
};

export type ChatListFilterTab = 'users' | 'bugs' | 'channels' | 'market' | 'games';

export type ChatThreadIndexRow = {
  rowKey: string;
  listFilter: ChatListFilterTab;
  contextType: ChatContextType;
  contextId: string;
  itemType: 'user' | 'group' | 'channel' | 'game';
  sortAt: number;
  itemJson: string;
  updatedAt: number;
};

export type MessageContextHeadRow = {
  key: string;
  latestMessageId: string;
  latestCreatedAt: number;
  updatedAt: number;
};

export type ThreadScrollRow = {
  key: string;
  anchorMessageId: string | null;
  atBottom: boolean;
  updatedAt: number;
};

export type MessageRowHeightRow = {
  messageId: string;
  heightPx: number;
  updatedAt: number;
};

export type ChatDraftLocalRow = {
  key: string;
  content: string;
  mentionIds: string[];
  updatedAt: string;
};

export type ChatMutationKind =
  | 'edit'
  | 'delete'
  | 'reaction_add'
  | 'reaction_remove'
  | 'pin'
  | 'unpin'
  | 'mark_read_batch';

export type ChatMutationQueueRow = {
  id: string;
  kind: ChatMutationKind;
  contextType: ChatContextType;
  contextId: string;
  messageId?: string;
  payload: Record<string, unknown>;
  clientMutationId: string;
  status: 'queued' | 'sending' | 'failed';
  createdAt: number;
  attempts: number;
  lastError?: string;
  nextRetryAt?: number;
};

class ChatLocalDexie extends Dexie {
  messages!: Table<ChatLocalRow, string>;
  chatSyncCursor!: Table<ChatLocalCursorRow, string>;
  outbox!: Table<ChatOutboxRow, string>;
  chatThreads!: Table<ChatThreadMetaRow, string>;
  threadIndex!: Table<ChatThreadIndexRow, string>;
  messageContextHead!: Table<MessageContextHeadRow, string>;
  threadScroll!: Table<ThreadScrollRow, string>;
  messageRowHeights!: Table<MessageRowHeightRow, string>;
  chatDrafts!: Table<ChatDraftLocalRow, string>;
  mutationQueue!: Table<ChatMutationQueueRow, string>;
  outboxMediaBlobs!: Table<OutboxMediaBlobRow, string>;

  constructor() {
    super('BandejaChatLocal');
    this.version(1).stores({
      messages: 'id, [contextType+contextId+chatType], createdAt, deletedAt',
      chatSyncCursor: 'key',
    });
    this.version(2).stores({
      messages: 'id, [contextType+contextId+chatType], createdAt, deletedAt',
      chatSyncCursor: 'key',
      outbox: 'tempId, [contextType+contextId], createdAt',
      chatThreads: 'key, updatedAt',
    });
    this.version(3).stores({
      messages: 'id, [contextType+contextId+chatType], createdAt, deletedAt',
      chatSyncCursor: 'key',
      outbox: 'tempId, [contextType+contextId], createdAt',
      chatThreads: 'key, updatedAt',
      threadIndex: 'rowKey, listFilter, sortAt, contextType, contextId, [contextType+contextId]',
    });
    this.version(4).stores({
      messages: 'id, [contextType+contextId+chatType], createdAt, deletedAt',
      chatSyncCursor: 'key',
      outbox: 'tempId, [contextType+contextId], createdAt',
      chatThreads: 'key, updatedAt',
      threadIndex: 'rowKey, listFilter, sortAt, contextType, contextId, [contextType+contextId]',
      messageContextHead: 'key, updatedAt',
    });
    this.version(5).stores({
      messages:
        'id, [contextType+contextId+chatType], [contextType+contextId], createdAt, deletedAt',
      chatSyncCursor: 'key',
      outbox: 'tempId, [contextType+contextId], createdAt',
      chatThreads: 'key, updatedAt',
      threadIndex: 'rowKey, listFilter, sortAt, contextType, contextId, [contextType+contextId]',
      messageContextHead: 'key, updatedAt',
    });
    this.version(6).stores({
      messages:
        'id, [contextType+contextId+chatType], [contextType+contextId], createdAt, deletedAt',
      chatSyncCursor: 'key',
      outbox: 'tempId, [contextType+contextId], createdAt',
      chatThreads: 'key, updatedAt',
      threadIndex: 'rowKey, listFilter, sortAt, contextType, contextId, [contextType+contextId]',
      messageContextHead: 'key, updatedAt',
    }).upgrade(async (tx) => {
      const table = tx.table('messageContextHead');
      const rows = await table.toArray();
      for (const row of rows) {
        const parts = row.key.split(':');
        if (parts.length === 2 && parts[0] === 'GAME') {
          const msg = await tx.table('messages').get(row.latestMessageId);
          const ct = (msg?.chatType as string | undefined) ?? 'PUBLIC';
          const newKey = `GAME:${parts[1]}:${ct}`;
          if (row.key !== newKey) {
            await table.delete(row.key);
            await table.put({ ...row, key: newKey });
          }
        }
      }
    });
    this.version(7).stores({
      messages:
        'id, [contextType+contextId+chatType], [contextType+contextId], createdAt, deletedAt',
      chatSyncCursor: 'key',
      outbox: 'tempId, [contextType+contextId], createdAt',
      chatThreads: 'key, updatedAt',
      threadIndex: 'rowKey, listFilter, sortAt, contextType, contextId, [contextType+contextId]',
      messageContextHead: 'key, updatedAt',
      threadScroll: 'key, updatedAt',
    });
    this.version(8).stores({
      messages:
        'id, [contextType+contextId+chatType], [contextType+contextId], createdAt, deletedAt',
      chatSyncCursor: 'key',
      outbox: 'tempId, [contextType+contextId], createdAt',
      chatThreads: 'key, updatedAt',
      threadIndex: 'rowKey, listFilter, sortAt, contextType, contextId, [contextType+contextId]',
      messageContextHead: 'key, updatedAt',
      threadScroll: 'key, updatedAt',
      messageRowHeights: 'messageId, updatedAt',
      chatDrafts: 'key, updatedAt',
    });
    this.version(9).stores({
      messages:
        'id, [contextType+contextId+chatType], [contextType+contextId], createdAt, deletedAt',
      chatSyncCursor: 'key',
      outbox: 'tempId, [contextType+contextId], createdAt',
      chatThreads: 'key, updatedAt',
      threadIndex: 'rowKey, listFilter, sortAt, contextType, contextId, [contextType+contextId]',
      messageContextHead: 'key, updatedAt',
      threadScroll: 'key, updatedAt',
      messageRowHeights: 'messageId, updatedAt',
      chatDrafts: 'key, updatedAt',
      mutationQueue: 'id, [contextType+contextId], status, createdAt',
    });
    this.version(10).stores({
      messages:
        'id, [contextType+contextId+chatType], [contextType+contextId], createdAt, deletedAt',
      chatSyncCursor: 'key',
      outbox: 'tempId, [contextType+contextId], createdAt',
      chatThreads: 'key, updatedAt',
      threadIndex: 'rowKey, listFilter, sortAt, contextType, contextId, [contextType+contextId]',
      messageContextHead: 'key, updatedAt',
      threadScroll: 'key, updatedAt',
      messageRowHeights: 'messageId, updatedAt',
      chatDrafts: 'key, updatedAt',
      mutationQueue: 'id, [contextType+contextId], status, createdAt',
      outboxMediaBlobs: 'id, tempId',
    }).upgrade(async (tx) => {
      const outbox = tx.table('outbox');
      const blobTable = tx.table('outboxMediaBlobs');
      const rows = await outbox.toArray();
      for (const row of rows as (ChatOutboxRow & { pendingImageBlobs?: Blob[] })[]) {
        const legacy = row.pendingImageBlobs;
        if (!legacy?.length) continue;
        for (let i = 0; i < legacy.length; i++) {
          const b = legacy[i];
          if (!b) continue;
          await blobTable.put({
            id: `${row.tempId}:img:${i}`,
            tempId: row.tempId,
            slot: i,
            kind: 'image' as const,
            blob: b,
          });
        }
        const { pendingImageBlobs: _drop, ...rest } = row as ChatOutboxRow & { pendingImageBlobs?: Blob[] };
        await outbox.put({
          ...rest,
          pendingImageBlobCount: legacy.length,
        });
      }
    });
    this.version(11).stores({
      messages:
        'id, [contextType+contextId+chatType], [contextType+contextId], createdAt, deletedAt',
      chatSyncCursor: 'key',
      outbox: 'tempId, [contextType+contextId], createdAt',
      chatThreads: 'key, updatedAt, lastOpenedAt, openCount',
      threadIndex: 'rowKey, listFilter, sortAt, contextType, contextId, [contextType+contextId]',
      messageContextHead: 'key, updatedAt',
      threadScroll: 'key, updatedAt',
      messageRowHeights: 'messageId, updatedAt',
      chatDrafts: 'key, updatedAt',
      mutationQueue: 'id, [contextType+contextId], status, createdAt',
      outboxMediaBlobs: 'id, tempId',
    });
  }
}

export const chatLocalDb = new ChatLocalDexie();

export function chatCursorKey(contextType: ChatContextType, contextId: string): string {
  return `${contextType}:${contextId}`;
}
