import type { ChatContextType, ChatMessage, ChatType } from '@/api/chat';
import { normalizeChatType } from '@/utils/chatType';
import { chatLocalDb } from './chatLocalDb';
import { normalizeChatLocalSearchQuery } from './chatLocalMessageSearchText';

export const THREAD_SEARCH_MAX = 200;
export const THREAD_SEARCH_PAGE_SIZE = 50;

export type LocalThreadSearchResult = {
  messages: ChatMessage[];
  hasMore: boolean;
};

export async function searchLocalThreadMessages(
  contextType: ChatContextType,
  contextId: string,
  chatType: ChatType,
  query: string,
  limit = THREAD_SEARCH_PAGE_SIZE
): Promise<LocalThreadSearchResult> {
  const needle = normalizeChatLocalSearchQuery(query);
  if (!needle || needle.length < 2 || !contextId) {
    return { messages: [], hasMore: false };
  }

  const cappedLimit = Math.min(Math.max(limit, 1), THREAD_SEARCH_MAX);
  const ct = normalizeChatType(chatType);
  const rows = await chatLocalDb.messages
    .where('[contextType+contextId+chatType]')
    .equals([contextType, contextId, ct])
    .filter(
      (r) =>
        r.deletedAt == null &&
        normalizeChatType(r.chatType) === ct &&
        normalizeChatType(r.payload.chatType) === ct &&
        !!r.searchText &&
        r.searchText.includes(needle)
    )
    .toArray();

  rows.sort((a, b) => b.createdAt - a.createdAt);
  return {
    messages: rows.slice(0, cappedLimit).map((r) => r.payload),
    hasMore: rows.length > cappedLimit,
  };
}
