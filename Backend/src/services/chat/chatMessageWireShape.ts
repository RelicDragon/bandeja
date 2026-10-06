import { toCompactRefs, type CompactRefsPayload } from '../../utils/compactRefs';

/**
 * Opt-in wire shape for chat message lists (`?shape=compact`).
 *
 * Default (`full`) is what shipped store builds parse and must not change: every message
 * carries `readReceipts` with an embedded user per receipt (~720 bytes each, ~80 KB per
 * message in big league chats) and repeats the full sender/reactor objects.
 *
 * `compact` omits `readReceipts` (legacy rows only — ticks come from `ChatReadCursor`, and
 * Message Details re-fetches the full message) and dedupes `sender` / `user` objects with
 * `toCompactRefs`. The client reverses it with `expandCompactRefs`.
 */
export type ChatMessageWireShape = 'full' | 'compact';

const CHAT_MESSAGE_REF_PROPS: ReadonlySet<string> = new Set(['sender', 'user']);

/** Newest-page size for a compact `messages/missed` call that has no `lastMessageId`. */
export const COMPACT_MISSED_COLD_TAIL = 50;

export function parseChatMessageWireShape(value: unknown): ChatMessageWireShape {
  return value === 'compact' ? 'compact' : 'full';
}

export function toChatMessagesWire<T>(
  messages: T[],
  shape: ChatMessageWireShape,
): T[] | CompactRefsPayload {
  return shape === 'compact' ? toCompactRefs(messages, CHAT_MESSAGE_REF_PROPS) : messages;
}
