import type { ChatMessage } from '@/api/chat';
import { mergeReadReceipts } from './mergeReadReceipts';
import { preferDeletedAt } from './chatLocalMessageTombstone';
import { sealMessageThreadScope } from './messageThreadScopeSeal';

/** Prefer incoming fields but never drop existing read receipts, delete tombstones, or reseal thread scope. */
export function mergeMessagePreservingReceipts<T extends ChatMessage>(
  existing: T | undefined,
  incoming: T
): T {
  if (!existing) return incoming;
  const sealed = sealMessageThreadScope(existing, incoming);
  return {
    ...existing,
    ...sealed,
    chatContextType: sealed.chatContextType,
    contextId: sealed.contextId,
    deletedAt: preferDeletedAt(existing.deletedAt, incoming.deletedAt),
    readReceipts: mergeReadReceipts(existing.readReceipts ?? [], incoming.readReceipts ?? []),
  };
}
