/**
 * Dexie `messageContextHead`: local tail pointer per `messageHeadDexieKey` (GAME = one row per chat tab).
 * Zustand `lastMessageId` in chatSyncStore is the in-memory tail for missed-message fetches; hydrate from
 * Dexie when missing. After event pulls, `syncLastMessageIdsToStoreFromLocalHeadsForContext` pushes heads
 * back into Zustand. Authoritative ordering for merges uses per-message `syncSeq` / `serverSyncSeq` from
 * the server; heads only locate “after which id” for getMissed-style network calls.
 */
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { messageHeadDexieKey } from '@/utils/chatSyncScope';
import { chatLocalDb, type ChatLocalRow } from './chatLocalDb';

export async function hydrateLastMessageIdFromDexieIfMissing(
  contextType: ChatContextType,
  contextId: string,
  gameChatType?: ChatType
): Promise<void> {
  if (useChatSyncStore.getState().getLastMessageId(contextType, contextId, gameChatType)) return;
  const key = messageHeadDexieKey(
    contextType,
    contextId,
    contextType === 'GAME' ? (gameChatType ?? 'PUBLIC') : 'PUBLIC'
  );
  const head = await chatLocalDb.messageContextHead.get(key);
  if (head?.latestMessageId) {
    useChatSyncStore.getState().setLastMessageId(contextType, contextId, head.latestMessageId, gameChatType);
  }
}

export async function bumpMessageContextHead(row: ChatLocalRow): Promise<void> {
  if (row.deletedAt != null) return;
  const key = messageHeadDexieKey(row.contextType, row.contextId, row.chatType);
  const cur = await chatLocalDb.messageContextHead.get(key);
  if (cur) {
    if (row.createdAt < cur.latestCreatedAt) return;
    if (row.createdAt === cur.latestCreatedAt && cur.latestMessageId === row.id) return;
  }
  await chatLocalDb.messageContextHead.put({
    key,
    latestMessageId: row.id,
    latestCreatedAt: row.createdAt,
    updatedAt: Date.now(),
  });
}

async function recomputeMessageContextHead(
  contextType: ChatContextType,
  contextId: string,
  chatType: ChatType
): Promise<void> {
  const rows = await chatLocalDb.messages
    .where('[contextType+contextId+chatType]')
    .equals([contextType, contextId, chatType])
    .filter((r) => r.deletedAt == null)
    .toArray();
  const key = messageHeadDexieKey(contextType, contextId, chatType);
  if (!rows.length) {
    await chatLocalDb.messageContextHead.delete(key);
    return;
  }
  rows.sort((a, b) => a.createdAt - b.createdAt);
  const best = rows[rows.length - 1]!;
  await chatLocalDb.messageContextHead.put({
    key,
    latestMessageId: best.id,
    latestCreatedAt: best.createdAt,
    updatedAt: Date.now(),
  });
}

export async function refreshMessageContextHeadAfterDelete(
  contextType: ChatContextType,
  contextId: string,
  deletedMessageId: string,
  chatType: ChatType
): Promise<void> {
  const key = messageHeadDexieKey(contextType, contextId, chatType);
  const cur = await chatLocalDb.messageContextHead.get(key);
  if (!cur || cur.latestMessageId !== deletedMessageId) return;
  await recomputeMessageContextHead(contextType, contextId, chatType);
}

export async function getLatestLocalMessageRowAcrossChatTypes(
  contextType: ChatContextType,
  contextId: string
): Promise<ChatLocalRow | undefined> {
  const rows = await chatLocalDb.messages
    .where('[contextType+contextId]')
    .equals([contextType, contextId])
    .filter((r) => r.deletedAt == null)
    .toArray();
  if (!rows.length) return undefined;
  rows.sort((a, b) => a.createdAt - b.createdAt);
  return rows[rows.length - 1];
}

export async function syncLastMessageIdsToStoreFromLocalHeadsForContext(
  contextType: ChatContextType,
  contextId: string
): Promise<void> {
  if (contextType === 'GAME') {
    const prefix = `GAME:${contextId}:`;
    const heads = await chatLocalDb.messageContextHead
      .filter((h) => h.key.startsWith(prefix))
      .toArray();
    for (const h of heads) {
      if (!h.latestMessageId) continue;
      const chatType = h.key.slice(prefix.length) as ChatType;
      useChatSyncStore.getState().setLastMessageId('GAME', contextId, h.latestMessageId, chatType);
    }
  } else {
    const head = await chatLocalDb.messageContextHead.get(`${contextType}:${contextId}`);
    if (head?.latestMessageId) {
      useChatSyncStore.getState().setLastMessageId(contextType, contextId, head.latestMessageId);
    }
  }
}
