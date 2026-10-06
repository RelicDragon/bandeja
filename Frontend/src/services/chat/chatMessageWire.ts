import type { ChatMessage } from '@/api/chat';
import { expandCompactRefs, isCompactRefsPayload } from '@/utils/compactRefs';

/**
 * Message lists are requested with `?shape=compact` (Backend `chatMessageWireShape.ts`):
 * `sender` / `user` objects arrive deduped and legacy `readReceipts` are omitted. Shipped
 * store builds never send the param and keep the full shape.
 */
export const CHAT_MESSAGE_LIST_SHAPE = 'compact';

export function decodeChatMessageList(data: unknown): ChatMessage[] {
  const list = isCompactRefsPayload(data)
    ? expandCompactRefs<ChatMessage[]>(data)
    : ((data ?? []) as ChatMessage[]);
  return list.map((m) => (m.readReceipts ? m : { ...m, readReceipts: [] }));
}
