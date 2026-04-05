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
  const r = rowFromMessage(m);
  await putChatLocalRowsWithSearchTokens([r]);
  if (!isChatLocalIndexingSuppressed()) {
    void bumpMessageContextHead(r).catch(() => {});
    void patchThreadIndexFromMessage(m).catch(() => {});
  }
  if (m.thumbnailUrls?.some((u) => u && !u.startsWith('blob:') && !u.startsWith('data:'))) {
    scheduleChatMediaThumbPrefetchForMessage(m);
  }
}

export async function putLocalMessage(m: ChatMessage): Promise<void> {
  return enqueueChatLocalContextApply(m.chatContextType, m.contextId, () => putLocalMessageDirect(m));
}

export async function persistChatMessagesFromApi(messages: ChatMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const first = messages[0]!;
  return enqueueChatLocalContextApply(first.chatContextType, first.contextId, async () => {
    const rows: ChatLocalRow[] = messages.map((m) => rowFromMessage(m));
    await putChatLocalRowsWithSearchTokens(rows);
    for (const r of rows) {
      void bumpMessageContextHead(r).catch(() => {});
      const p = r.payload;
      if (p.thumbnailUrls?.some((u) => u && !u.startsWith('blob:') && !u.startsWith('data:'))) {
        scheduleChatMediaThumbPrefetchForMessage(p);
      }
    }
  });
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
): Promise<void> {
  const peek = await chatLocalDb.messages.get(messageId);
  if (!peek) return;
  const editedAt = new Date().toISOString();
  const nextPayload = { ...peek.payload, content: patch.content, mentionIds: patch.mentionIds, editedAt };
  return enqueueChatLocalContextApply(peek.contextType, peek.contextId, () => putLocalMessageDirect(nextPayload));
}

export async function applyLocalReactionOptimisticReplace(
  messageId: string,
  reactions: MessageReaction[]
): Promise<void> {
  const row = await chatLocalDb.messages.get(messageId);
  if (!row) return;
  return enqueueChatLocalContextApply(row.contextType, row.contextId, async () => {
    const fresh = await chatLocalDb.messages.get(messageId);
    if (!fresh) return;
    await putChatLocalRowsWithSearchTokens([rowFromMessage({ ...fresh.payload, reactions })]);
  });
}
