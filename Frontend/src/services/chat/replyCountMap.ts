import type { ChatMessage } from '@/api/chat';

/** Map replied-to message id → reply count (single pass over messages). */
export function buildReplyCountMap(messages: readonly ChatMessage[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const msg of messages) {
    const parentId = msg.replyToId;
    if (!parentId) continue;
    map.set(parentId, (map.get(parentId) ?? 0) + 1);
  }
  return map;
}

/** First reply id for a parent message (for scroll-to-replies). */
export function findFirstReplyId(messages: readonly ChatMessage[], parentId: string): string | undefined {
  for (const msg of messages) {
    if (msg.replyToId === parentId) return msg.id;
  }
  return undefined;
}
