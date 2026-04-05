import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { chatLocalDb, type ChatListFilterTab, type ChatThreadIndexRow } from '@/services/chat/chatLocalDb';
import { mapThreadIndexRowsToSortedChatItems } from '@/services/chat/chatThreadIndex';
import type { ChatItem } from '@/utils/chatListSort';

export function useChatListThreadIndexLive(
  listFilter: ChatListFilterTab | null,
  enabled: boolean
): ChatItem[] | undefined {
  const rows = useLiveQuery(
    () => {
      if (!enabled || !listFilter) return [] as ChatThreadIndexRow[];
      return chatLocalDb.threadIndex.where('listFilter').equals(listFilter).toArray();
    },
    [listFilter, enabled]
  );

  return useMemo(() => {
    if (rows === undefined) return undefined;
    return mapThreadIndexRowsToSortedChatItems(rows);
  }, [rows]);
}
