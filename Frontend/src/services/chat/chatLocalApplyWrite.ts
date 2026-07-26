import type { ChatMessage, MessageReaction } from '@/api/chat';
import { chatLocalDb, type ChatLocalRow } from './chatLocalDb';
import { patchThreadIndexAfterMessageDeleted, patchThreadIndexFromMessage } from './chatThreadIndex';
import {
  bumpMessageContextHead,
  refreshMessageContextHeadAfterDelete,
} from './messageContextHead';
import { enqueueChatLocalContextApply } from './chatLocalApplyQueue';
import { scheduleChatMediaThumbPrefetchForMessage } from '@/services/chat/chatMediaThumbPrefetch';
import { rowFromMessage } from '@/services/chat/chatSyncRowUtils';
import { isChatLocalIndexingSuppressed } from './chatLocalApplyBulk';
import { replaceMessageSearchTokensInTransaction } from './chatLocalMessageSearchTokens';
import { mergeMessagePreservingReceipts } from './mergeMessagePreservingReceipts';

export async function putChatLocalRowsWithSearchTokens(rows: ChatLocalRow[]): Promise<void> {
  if (rows.length === 0) return;
  await chatLocalDb.transaction('rw', [chatLocalDb.messages, chatLocalDb.messageSearchTokens], async (tx) => {
    await tx.table('messages').bulkPut(rows);
    for (const r of rows) {
      const st = r.deletedAt != null ? undefined : r.searchText;
      await replaceMessageSearchTokensInTransaction(tx, r.id, st);
    }
  });
}

export async function putLocalMessageDirect(m: ChatMessage): Promise<void> {
  const existing = await chatLocalDb.messages.get(m.id);
  const merged = mergeMessagePreservingReceipts(existing?.payload, m);
  const r = rowFromMessage(merged);
  await putChatLocalRowsWithSearchTokens([r]);
  if (!isChatLocalIndexingSuppressed()) {
    void bumpMessageContextHead(r).catch(() => {});
    void patchThreadIndexFromMessage(merged).catch(() => {});
  }
  if (merged.thumbnailUrls?.some((u) => u && !u.startsWith('blob:') && !u.startsWith('data:'))) {
    scheduleChatMediaThumbPrefetchForMessage(merged);
  }
}

export async function persistChatMessagesFromApiDirect(messages: ChatMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const ids = messages.map((m) => m.id);
  const existingRows = await chatLocalDb.messages.bulkGet(ids);
  const byId = new Map<string, ChatMessage>();
  for (const row of existingRows) {
    if (row) byId.set(row.id, row.payload);
  }
  const rows: ChatLocalRow[] = messages.map((m) =>
    rowFromMessage(mergeMessagePreservingReceipts(byId.get(m.id), m))
  );
  await putChatLocalRowsWithSearchTokens(rows);
  for (const r of rows) {
    void bumpMessageContextHead(r).catch(() => {});
    const p = r.payload;
    if (!isChatLocalIndexingSuppressed()) {
      void patchThreadIndexFromMessage(p).catch(() => {});
    }
    if (p.thumbnailUrls?.some((u) => u && !u.startsWith('blob:') && !u.startsWith('data:'))) {
      scheduleChatMediaThumbPrefetchForMessage(p);
    }
  }
}

export async function putLocalMessage(m: ChatMessage): Promise<number> {
  const { applyThreadEvent } = await import('./chatLocalApplyThreadEvent');
  return applyThreadEvent({ kind: 'sendSuccess', message: m });
}

export async function persistChatMessagesFromApi(messages: ChatMessage[]): Promise<number> {
  if (messages.length === 0) return 0;
  const { applyThreadEvent } = await import('./chatLocalApplyThreadEvent');
  return applyThreadEvent({ kind: 'httpMessages', messages });
}

async function markLocalMessageDeletedDirect(messageId: string, deletedAtIso?: string): Promise<void> {
  const row = await chatLocalDb.messages.get(messageId);
  if (!row) return;
  const iso = deletedAtIso ?? new Date().toISOString();
  await putChatLocalRowsWithSearchTokens([rowFromMessage({ ...row.payload, deletedAt: iso })]);
  if (!isChatLocalIndexingSuppressed()) {
    void refreshMessageContextHeadAfterDelete(row.contextType, row.contextId, messageId, row.chatType).catch(
      () => {}
    );
    void patchThreadIndexAfterMessageDeleted(messageId).catch(() => {});
  }
}

export async function markLocalMessageDeleted(messageId: string, deletedAtIso?: string): Promise<void> {
  const peek = await chatLocalDb.messages.get(messageId);
  if (!peek) return;
  return enqueueChatLocalContextApply(peek.contextType, peek.contextId, () =>
    markLocalMessageDeletedDirect(messageId, deletedAtIso)
  );
}

export async function applyLocalMessageEditOptimistic(
  messageId: string,
  patch: { content: string; mentionIds: string[] }
): Promise<number> {
  const peek = await chatLocalDb.messages.get(messageId);
  if (!peek) return 0;
  const { applyThreadEvent } = await import('./chatLocalApplyThreadEvent');
  return applyThreadEvent({
    kind: 'optimisticEdit',
    contextType: peek.contextType,
    contextId: peek.contextId,
    messageId,
    patch,
  });
}

export async function applyLocalReactionOptimisticReplace(
  messageId: string,
  reactions: MessageReaction[]
): Promise<number> {
  const row = await chatLocalDb.messages.get(messageId);
  if (!row) return 0;
  const { applyThreadEvent } = await import('./chatLocalApplyThreadEvent');
  return applyThreadEvent({
    kind: 'optimisticReaction',
    contextType: row.contextType,
    contextId: row.contextId,
    messageId,
    reactions,
  });
}
