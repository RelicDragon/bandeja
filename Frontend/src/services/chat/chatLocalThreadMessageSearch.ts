import type { ChatContextType, ChatMessage, ChatType } from '@/api/chat';
import { normalizeChatType } from '@/utils/chatType';
import { chatLocalDb } from './chatLocalDb';
import { normalizeChatLocalSearchQuery } from './chatLocalMessageSearchText';

const THREAD_SEARCH_MAX = 200;

export async function searchLocalThreadMessages(
  contextType: ChatContextType,
  contextId: string,
  chatType: ChatType,
  query: string
): Promise<ChatMessage[]> {
  const needle = normalizeChatLocalSearchQuery(query);
  if (!needle || needle.length < 2 || !contextId) return [];

  const ct = normalizeChatType(chatType);
  const rows = await chatLocalDb.messages
    .where('[contextType+contextId+chatType]')
    .equals([contextType, contextId, ct])
    .filter((r) => r.deletedAt == null && !!r.searchText && r.searchText.includes(needle))
    .toArray();

  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows.slice(0, THREAD_SEARCH_MAX).map((r) => r.payload);
}
