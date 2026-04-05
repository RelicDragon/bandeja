import type { ChatMessage } from '@/api/chat';
import { computeMessageSortKey } from '@/utils/chatMessageSort';
import type { ChatLocalRow } from './chatLocalDb';
import { computeChatLocalSearchText } from './chatLocalMessageSearchText';

export function rowFromMessage(m: ChatMessage): ChatLocalRow {
  const deletedAt = m.deletedAt ? new Date(m.deletedAt).getTime() : undefined;
  return {
    id: m.id,
    contextType: m.chatContextType,
    contextId: m.contextId,
    chatType: m.chatType,
    createdAt: new Date(m.createdAt).getTime(),
    deletedAt,
    sortKey: computeMessageSortKey(m),
    searchText: computeChatLocalSearchText(m) ?? undefined,
    payload: m,
  };
}
