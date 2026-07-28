import type { ChatContextType, MessageReadReceipt } from '@/api/chat';

type PendingReceipt = { userId: string; readAt: string };

const pendingByMessage = new Map<string, PendingReceipt[]>();

function messageKey(
  contextType: ChatContextType,
  contextId: string,
  messageId: string
): string {
  return `${contextType}\0${contextId}\0${messageId}`;
}

function threadPrefix(contextType: ChatContextType, contextId: string): string {
  return `${contextType}\0${contextId}\0`;
}

/** Stash a read receipt for a message not yet in the open-thread projection. */
const PENDING_CAP = 2000;

export function stashPendingThreadReadReceipt(
  contextType: ChatContextType,
  contextId: string,
  messageId: string,
  userId: string,
  readAt: string
): void {
  if (!messageId || !userId || !readAt) return;
  const key = messageKey(contextType, contextId, messageId);
  const prev = pendingByMessage.get(key) ?? [];
  if (prev.some((r) => r.userId === userId && r.readAt === readAt)) return;
  const withoutUser = prev.filter((r) => r.userId !== userId);
  pendingByMessage.set(key, [...withoutUser, { userId, readAt }]);
  if (pendingByMessage.size > PENDING_CAP) {
    const first = pendingByMessage.keys().next().value;
    if (first) pendingByMessage.delete(first);
  }
}

/** Consume and remove pending receipts for one message. */
export function takePendingThreadReadReceipts(
  contextType: ChatContextType,
  contextId: string,
  messageId: string
): PendingReceipt[] {
  const key = messageKey(contextType, contextId, messageId);
  const rows = pendingByMessage.get(key);
  if (!rows || rows.length === 0) return [];
  pendingByMessage.delete(key);
  return rows;
}

export function clearPendingThreadReadReceipts(
  contextType: ChatContextType,
  contextId: string
): void {
  const prefix = threadPrefix(contextType, contextId);
  for (const key of pendingByMessage.keys()) {
    if (key.startsWith(prefix)) pendingByMessage.delete(key);
  }
}

export function pendingReceiptsToMessageReadReceipts(
  messageId: string,
  pending: readonly PendingReceipt[]
): MessageReadReceipt[] {
  return pending.map((r) => ({
    id: `pending-${messageId}-${r.userId}`,
    messageId,
    userId: r.userId,
    readAt: r.readAt,
  }));
}

/** Test helper. */
export function resetPendingThreadReadReceiptsForTests(): void {
  pendingByMessage.clear();
}
