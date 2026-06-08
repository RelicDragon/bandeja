import { deduplicateChats } from '@/utils/chatListHelpers';
import { sortChatItems, type ChatItem } from '@/utils/chatListSort';

/** Merge users-tab Dexie slices (users/groups + legacy games partition) into one sorted list. */
export function mergeDexThreadIndexForUsersTab(
  fromUsersDex: ChatItem[],
  fromGamesDex: ChatItem[],
  userId?: string
): ChatItem[] {
  return sortChatItems(deduplicateChats([...fromUsersDex, ...fromGamesDex]), 'users', userId);
}
