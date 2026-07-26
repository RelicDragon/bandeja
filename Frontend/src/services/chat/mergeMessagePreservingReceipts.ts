import type { ChatMessage } from '@/api/chat';
import { mergeReadReceipts } from './mergeReadReceipts';

/** Prefer incoming fields but never drop existing read receipts when incoming omits them. */
export function mergeMessagePreservingReceipts<T extends ChatMessage>(
  existing: T | undefined,
  incoming: T
): T {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    readReceipts: mergeReadReceipts(existing.readReceipts ?? [], incoming.readReceipts ?? []),
  };
}
