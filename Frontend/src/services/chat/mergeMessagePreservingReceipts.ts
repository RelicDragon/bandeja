import type { ChatMessage } from '@/api/chat';
import { mergeReadReceipts } from './mergeReadReceipts';
import { preferDeletedAt } from './chatLocalMessageTombstone';

/** Prefer incoming fields but never drop existing read receipts or delete tombstones. */
export function mergeMessagePreservingReceipts<T extends ChatMessage>(
  existing: T | undefined,
  incoming: T
): T {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    deletedAt: preferDeletedAt(existing.deletedAt, incoming.deletedAt),
    readReceipts: mergeReadReceipts(existing.readReceipts ?? [], incoming.readReceipts ?? []),
  };
}
