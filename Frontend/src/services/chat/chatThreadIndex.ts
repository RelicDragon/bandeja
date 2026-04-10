import type { ChatContextType, ChatMessage } from '@/api/chat';
import type { ChatItem, ChatListOutbox } from '@/utils/chatListSort';
import type { Game } from '@/types';
import { calculateLastMessageDate } from '@/utils/chatListHelpers';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '@/store/navigationStore';
import { chatLocalDb, type ChatListFilterTab, type ChatThreadIndexRow } from './chatLocalDb';
import { getLatestLocalMessageRowAcrossChatTypes } from './messageContextHead';
import { normalizeChatType } from '@/utils/chatType';
import { computeListOutboxForContext } from './chatOutboxListOutboxCompute';
import { scheduleChatListOutboxBump } from './chatListOutboxBumpScheduler';

const ITEM_JSON_VERSION = 1 as const;
const THREAD_INDEX_CAS_RETRIES = 8;

function shouldIncrementThreadUnread(message: ChatMessage): boolean {
  if (
    message.chatContextType !== 'USER' &&
    message.chatContextType !== 'GROUP' &&
    message.chatContextType !== 'GAME'
  ) {
    return false;
  }
  const me = useAuthStore.getState().user?.id;
  if (!me || !message.senderId || message.senderId === me) return false;
  const nav = useNavigationStore.getState();
  if (message.chatContextType === 'USER' && nav.viewingUserChatId === message.contextId) return false;
  if (message.chatContextType === 'GROUP' && nav.viewingGroupChannelId === message.contextId) return false;
  if (message.chatContextType === 'GAME' && nav.viewingGameChatId === message.contextId) {
    if (
      nav.viewingGameChatChatType &&
      normalizeChatType(message.chatType) !== normalizeChatType(nav.viewingGameChatChatType)
    ) {
      return true;
    }
    return false;
  }
  return true;
}

function rowKeyForItem(listFilter: ChatListFilterTab, item: ChatItem): string | null {
  if (item.type === 'contact') return null;
  return `${listFilter}:${item.type}:${item.data.id}`;
}

function contextForChatItem(item: ChatItem): { contextType: ChatContextType; contextId: string } | null {
  if (item.type === 'user') return { contextType: 'USER', contextId: item.data.id };
  if (item.type === 'group' || item.type === 'channel') return { contextType: 'GROUP', contextId: item.data.id };
  if (item.type === 'game') return { contextType: 'GAME', contextId: item.data.id };
  return null;
}

function toStorableItem(item: Exclude<ChatItem, { type: 'contact' }>) {
  return {
    ...item,
    lastMessageDate: item.lastMessageDate ? item.lastMessageDate.getTime() : null,
  };
}

function fromStorableItem(raw: unknown): ChatItem | null {
  if (!raw || typeof raw !== 'object' || !('type' in raw)) return null;
  const r = raw as Record<string, unknown> & { type: string; lastMessageDate?: number | null };
  if (r.type === 'contact') return raw as ChatItem;
  const lm = r.lastMessageDate != null ? new Date(r.lastMessageDate as number) : null;
  if (r.type === 'user' || r.type === 'group' || r.type === 'channel' || r.type === 'game') {
    return { ...r, lastMessageDate: lm } as ChatItem;
  }
  return null;
}

function stringifyItem(item: ChatItem): string {
  if (item.type === 'contact') return '';
  return JSON.stringify({ v: ITEM_JSON_VERSION, item: toStorableItem(item) });
}

function parseItem(json: string): ChatItem | null {
  try {
    const raw = JSON.parse(json) as unknown;
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    if ('v' in o) {
      if (o.v !== ITEM_JSON_VERSION) return null;
      if (!o.item || typeof o.item !== 'object') return null;
      return fromStorableItem(o.item);
    }
    return fromStorableItem(raw);
  } catch {
    return null;
  }
}

function sortKey(item: ChatItem): number {
  if (item.type === 'contact') return 0;
  const d = item.lastMessageDate;
  if (d) return d.getTime();
  try {
    return new Date(item.data.updatedAt).getTime();
  } catch {
    return 0;
  }
}

function listSortTimestamp(row: ChatThreadIndexRow, item: ChatItem): number {
  if (item.type === 'contact') return 0;
  return Math.max(row.sortAt, sortKey(item));
}

export function chatItemsFromUnreadGames(items: Array<{ game: Game; unreadCount: number }>): ChatItem[] {
  return items.map((x) => {
    const lastMessageDate = x.game.lastMessage
      ? new Date(x.game.lastMessage.updatedAt)
      : new Date(x.game.updatedAt);
    return {
      type: 'game' as const,
      data: x.game,
      lastMessageDate,
      unreadCount: x.unreadCount,
    };
  });
}

export function syncUserThreadIndexFromUnreadMap(map: Record<string, number>): void {
  for (const [chatId, n] of Object.entries(map)) {
    void patchThreadIndexSetUnreadCount('USER', chatId, n);
  }
}

export async function pruneThreadIndexUserChatsNotIn(validChatIds: Set<string>): Promise<void> {
  const rows = await chatLocalDb.threadIndex.where('contextType').equals('USER').toArray();
  const toDelete = rows.filter((r) => !validChatIds.has(r.contextId)).map((r) => r.rowKey);
  if (toDelete.length) await chatLocalDb.threadIndex.bulkDelete(toDelete);
}

export function mapThreadIndexRowsToSortedChatItems(rows: ChatThreadIndexRow[]): ChatItem[] {
  const pairs: { row: ChatThreadIndexRow; item: ChatItem }[] = [];
  for (const r of rows) {
    const it = parseItem(r.itemJson);
    if (!it || it.type === 'contact') continue;
    pairs.push({ row: r, item: it });
  }
  pairs.sort((a, b) => {
    if (a.item.type === 'contact' || b.item.type === 'contact') return 0;
    return listSortTimestamp(b.row, b.item) - listSortTimestamp(a.row, a.item);
  });
  return pairs.map((p) => p.item);
}

export async function loadThreadIndexForList(listFilter: ChatListFilterTab): Promise<ChatItem[]> {
  const rows = await chatLocalDb.threadIndex.where('listFilter').equals(listFilter).toArray();
  const toDelete: string[] = [];
  const validRows: ChatThreadIndexRow[] = [];
  for (const r of rows) {
    const it = parseItem(r.itemJson);
    if (!it || it.type === 'contact') {
      toDelete.push(r.rowKey);
      continue;
    }
    validRows.push(r);
  }
  if (toDelete.length) {
    await chatLocalDb.threadIndex.bulkDelete(toDelete);
  }
  return mapThreadIndexRowsToSortedChatItems(validRows);
}

function rowToPutBase(row: ChatThreadIndexRow): Omit<ChatThreadIndexRow, 'itemJson' | 'sortAt' | 'updatedAt'> {
  return {
    rowKey: row.rowKey,
    listFilter: row.listFilter,
    contextType: row.contextType,
    contextId: row.contextId,
    itemType: row.itemType,
  };
}

async function putThreadRowIfUnchanged(
  rowKey: string,
  expectedUpdatedAt: number,
  next: ChatThreadIndexRow
): Promise<boolean> {
  const latest = await chatLocalDb.threadIndex.get(rowKey);
  if (!latest || latest.updatedAt !== expectedUpdatedAt) return false;
  await chatLocalDb.threadIndex.put(next);
  return true;
}

export type PersistThreadIndexOptions = {
  /** When true, delete thread rows for this list not present in `chats`. Default false (merge-only). */
  pruneRemoved?: boolean;
};

export async function persistThreadIndexReplace(
  listFilter: ChatListFilterTab,
  chats: ChatItem[],
  options?: PersistThreadIndexOptions
): Promise<void> {
  const pruneRemoved = options?.pruneRemoved === true;

  const rows = chats
    .map((item) => {
      if (item.type === 'contact') return null;
      const rk = rowKeyForItem(listFilter, item);
      if (!rk) return null;
      const ctx = contextForChatItem(item);
      if (!ctx) return null;
      const sk = sortKey(item);
      return {
        rowKey: rk,
        listFilter,
        contextType: ctx.contextType,
        contextId: ctx.contextId,
        itemType: item.type as ChatThreadIndexRow['itemType'],
        sortAt: sk,
        itemJson: stringifyItem(item),
        updatedAt: Date.now(),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  await chatLocalDb.transaction('rw', chatLocalDb.threadIndex, async () => {
    const nextKeys = new Set(rows.map((r) => r.rowKey));
    const existingInTx = await chatLocalDb.threadIndex.where('listFilter').equals(listFilter).toArray();
    if (pruneRemoved) {
      for (const e of existingInTx) {
        if (!nextKeys.has(e.rowKey)) await chatLocalDb.threadIndex.delete(e.rowKey);
      }
    }
    if (rows.length) await chatLocalDb.threadIndex.bulkPut(rows);
  });
  const seenCtx = new Set<string>();
  let outboxBump = false;
  for (const r of rows) {
    const k = `${r.contextType}:${r.contextId}`;
    if (seenCtx.has(k)) continue;
    seenCtx.add(k);
    const lo = await computeListOutboxForContext(r.contextType, r.contextId);
    await patchThreadIndexOutbox(r.contextType, r.contextId, lo);
    outboxBump = true;
  }
  if (outboxBump) scheduleChatListOutboxBump();
}

export async function persistThreadIndexUpsert(listFilter: ChatListFilterTab, chats: ChatItem[]): Promise<void> {
  const rows = chats
    .map((item) => {
      if (item.type === 'contact') return null;
      const rk = rowKeyForItem(listFilter, item);
      if (!rk) return null;
      const ctx = contextForChatItem(item);
      if (!ctx) return null;
      const sk = sortKey(item);
      return {
        rowKey: rk,
        listFilter,
        contextType: ctx.contextType,
        contextId: ctx.contextId,
        itemType: item.type as ChatThreadIndexRow['itemType'],
        sortAt: sk,
        itemJson: stringifyItem(item),
        updatedAt: Date.now(),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  if (rows.length === 0) return;
  await chatLocalDb.threadIndex.bulkPut(rows);
  const seenUpsert = new Set<string>();
  let outboxBumpUpsert = false;
  for (const r of rows) {
    const k = `${r.contextType}:${r.contextId}`;
    if (seenUpsert.has(k)) continue;
    seenUpsert.add(k);
    const lo = await computeListOutboxForContext(r.contextType, r.contextId);
    await patchThreadIndexOutbox(r.contextType, r.contextId, lo);
    outboxBumpUpsert = true;
  }
  if (outboxBumpUpsert) scheduleChatListOutboxBump();
}

export async function patchThreadIndexSetUnreadCount(
  contextType: ChatContextType,
  contextId: string,
  unreadCount: number
): Promise<void> {
  const rows = await chatLocalDb.threadIndex
    .where('[contextType+contextId]')
    .equals([contextType, contextId])
    .toArray();
  for (const row of rows) {
    const seenAt = row.updatedAt;
    const item = parseItem(row.itemJson);
    if (!item || item.type === 'contact' || !('unreadCount' in item)) continue;
    if ((item.unreadCount ?? 0) === unreadCount) continue;
    const next = { ...item, unreadCount } as ChatItem;
    await putThreadRowIfUnchanged(row.rowKey, seenAt, {
      ...rowToPutBase(row),
      sortAt: row.sortAt,
      itemJson: stringifyItem(next),
      updatedAt: Date.now(),
    });
  }
}

export async function patchThreadIndexClearUnread(
  contextType: ChatContextType,
  contextId: string
): Promise<void> {
  const rows = await chatLocalDb.threadIndex
    .where('[contextType+contextId]')
    .equals([contextType, contextId])
    .toArray();
  for (const row of rows) {
    const seenAt = row.updatedAt;
    const item = parseItem(row.itemJson);
    if (!item || item.type === 'contact' || !('unreadCount' in item)) continue;
    if ((item.unreadCount ?? 0) === 0) continue;
    const next = { ...item, unreadCount: 0 } as ChatItem;
    await putThreadRowIfUnchanged(row.rowKey, seenAt, {
      ...rowToPutBase(row),
      sortAt: row.sortAt,
      itemJson: stringifyItem(next),
      updatedAt: Date.now(),
    });
  }
}

export async function patchThreadIndexOutbox(
  contextType: ChatContextType,
  contextId: string,
  listOutbox: ChatListOutbox | null
): Promise<void> {
  const initial = await chatLocalDb.threadIndex
    .where('[contextType+contextId]')
    .equals([contextType, contextId])
    .toArray();
  const rowKeys = [...new Set(initial.map((r) => r.rowKey))];
  for (const rowKey of rowKeys) {
    for (let attempt = 0; attempt < THREAD_INDEX_CAS_RETRIES; attempt++) {
      const latest = await chatLocalDb.threadIndex.get(rowKey);
      if (!latest) break;
      if (latest.contextType !== contextType || latest.contextId !== contextId) break;
      const item = parseItem(latest.itemJson);
      if (!item || item.type === 'contact') break;
      const next = { ...item } as ChatItem & { listOutbox?: ChatListOutbox | null };
      if (listOutbox == null) {
        delete next.listOutbox;
      } else {
        next.listOutbox = listOutbox;
      }
      const itemSort = sortKey(next);
      const nextSort = listOutbox != null ? Math.max(latest.sortAt, Date.now()) : itemSort;
      const applied = await putThreadRowIfUnchanged(rowKey, latest.updatedAt, {
        ...rowToPutBase(latest),
        sortAt: nextSort,
        itemJson: stringifyItem(next),
        updatedAt: Date.now(),
      });
      if (applied) break;
    }
  }
}

export async function reconcileThreadIndexOutboxForContext(
  contextType: ChatContextType,
  contextId: string
): Promise<void> {
  const lo = await computeListOutboxForContext(contextType, contextId);
  await patchThreadIndexOutbox(contextType, contextId, lo);
  scheduleChatListOutboxBump();
}

export type PatchThreadIndexFromMessageOptions = {
  /** When false, only lastMessage / sort fields are updated (socket unread events own counts). Default true. */
  applyUnread?: boolean;
};

export async function patchThreadIndexFromMessage(
  message: ChatMessage,
  options?: PatchThreadIndexFromMessageOptions
): Promise<void> {
  const applyUnread = options?.applyUnread !== false;
  const initialRows = await chatLocalDb.threadIndex
    .where('[contextType+contextId]')
    .equals([message.chatContextType, message.contextId])
    .toArray();
  if (!initialRows.length) return;
  const sortAtMsg = Math.max(
    new Date(message.createdAt).getTime(),
    new Date(message.updatedAt ?? message.createdAt).getTime()
  );
  const updatedAtIso = message.updatedAt ?? message.createdAt;
  const bumpUnread = applyUnread && shouldIncrementThreadUnread(message);
  for (const rowRef of initialRows) {
    for (let attempt = 0; attempt < THREAD_INDEX_CAS_RETRIES; attempt++) {
      const latest = await chatLocalDb.threadIndex.get(rowRef.rowKey);
      if (!latest) break;
      const item = parseItem(latest.itemJson);
      if (!item || item.type === 'contact') break;
      const draft = 'draft' in item ? item.draft : undefined;
      const lastMessageDate = calculateLastMessageDate(message, draft ?? null, updatedAtIso);
      const prevUnread = 'unreadCount' in item ? (item.unreadCount ?? 0) : 0;
      const next = {
        ...item,
        data: { ...item.data, lastMessage: message, updatedAt: updatedAtIso },
        lastMessageDate,
        ...(bumpUnread && 'unreadCount' in item ? { unreadCount: prevUnread + 1 } : {}),
      } as ChatItem & { listOutbox?: ChatListOutbox | null };
      delete next.listOutbox;
      const applied = await putThreadRowIfUnchanged(rowRef.rowKey, latest.updatedAt, {
        ...rowToPutBase(latest),
        sortAt: Math.max(latest.sortAt, sortAtMsg, lastMessageDate.getTime()),
        itemJson: stringifyItem(next),
        updatedAt: Date.now(),
      });
      if (applied) break;
    }
  }
  await reconcileThreadIndexOutboxForContext(message.chatContextType, message.contextId);
}

export async function patchThreadIndexAfterMessageDeleted(messageId: string): Promise<void> {
  const msgRow = await chatLocalDb.messages.get(messageId);
  if (!msgRow) return;
  const { contextType, contextId } = msgRow;
  const rows = await chatLocalDb.threadIndex
    .where('[contextType+contextId]')
    .equals([contextType, contextId])
    .toArray();
  const latestRow = await getLatestLocalMessageRowAcrossChatTypes(contextType, contextId);
  const latestPayload = latestRow?.payload;
  for (const row of rows) {
    const seenAt = row.updatedAt;
    const item = parseItem(row.itemJson);
    if (!item || item.type === 'contact') continue;
    const lm = item.data.lastMessage as ChatMessage | undefined | null;
    if (!lm || lm.id !== messageId) continue;
    const draft = 'draft' in item ? item.draft : undefined;
    const updatedAtIso = latestPayload
      ? (latestPayload.updatedAt ?? latestPayload.createdAt)
      : item.data.updatedAt;
    const lastMessageDate = latestPayload
      ? calculateLastMessageDate(latestPayload, draft ?? null, updatedAtIso)
      : draft
        ? calculateLastMessageDate(null, draft, item.data.updatedAt)
        : null;
    const nextData = latestPayload
      ? { ...item.data, lastMessage: latestPayload, updatedAt: updatedAtIso }
      : (() => {
          const rest = { ...item.data } as Record<string, unknown>;
          delete rest.lastMessage;
          return rest as unknown as (typeof item)['data'];
        })();
    const next = {
      ...item,
      data: nextData,
      lastMessageDate,
    } as ChatItem;
    const nextSort = lastMessageDate ? Math.max(row.sortAt, lastMessageDate.getTime()) : row.sortAt;
    await putThreadRowIfUnchanged(row.rowKey, seenAt, {
      ...rowToPutBase(row),
      sortAt: nextSort,
      itemJson: stringifyItem(next),
      updatedAt: Date.now(),
    });
  }
  await reconcileThreadIndexOutboxForContext(contextType, contextId);
}

export async function clearChatLocalStores(): Promise<void> {
  const { clearMessageHeightMemoryCache } = await import('@/services/chat/chatMessageHeights');
  clearMessageHeightMemoryCache();
  await chatLocalDb.transaction(
    'rw',
    [
      chatLocalDb.messages,
      chatLocalDb.chatSyncCursor,
      chatLocalDb.outbox,
      chatLocalDb.outboxMediaBlobs,
      chatLocalDb.chatThreads,
      chatLocalDb.threadIndex,
      chatLocalDb.messageContextHead,
      chatLocalDb.messageRowHeights,
      chatLocalDb.chatDrafts,
      chatLocalDb.mutationQueue,
      chatLocalDb.messageSearchTokens,
    ],
    async () => {
      await chatLocalDb.messageSearchTokens.clear();
      await chatLocalDb.messages.clear();
      await chatLocalDb.chatSyncCursor.clear();
      await chatLocalDb.outboxMediaBlobs.clear();
      await chatLocalDb.outbox.clear();
      await chatLocalDb.chatThreads.clear();
      await chatLocalDb.threadIndex.clear();
      await chatLocalDb.messageContextHead.clear();
      await chatLocalDb.messageRowHeights.clear();
      await chatLocalDb.chatDrafts.clear();
      await chatLocalDb.mutationQueue.clear();
    }
  );
}
