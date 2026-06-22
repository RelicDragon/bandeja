import type { ChatMessage } from '@/api/chat';
import { computeMessageSortKey } from '@/utils/chatMessageSort';
import { normalizeChatType } from '@/utils/chatType';
import type { ChatLocalRow } from './chatLocalDb';
import { computeChatLocalSearchText } from './chatLocalMessageSearchText';

export function rowFromMessage(m: ChatMessage): ChatLocalRow {
  const deletedAt = m.deletedAt ? new Date(m.deletedAt).getTime() : undefined;
  const chatType = normalizeChatType(m.chatType);
  return {
    id: m.id,
    contextType: m.chatContextType,
    contextId: m.contextId,
    chatType,
    createdAt: new Date(m.createdAt).getTime(),
    deletedAt,
    sortKey: computeMessageSortKey(m),
    searchText: computeChatLocalSearchText(m) ?? undefined,
    payload: m,
  };
}
