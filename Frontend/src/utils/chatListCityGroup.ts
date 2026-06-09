import { chatApi, type ChatDraft } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { loadThreadIndexItemForContext } from '@/services/chat/chatThreadIndex';
import { resolveGroupUnreadCounts } from '@/utils/unreadCountsFromStore';
import { deduplicateChats, groupsToChatItems } from '@/utils/chatListHelpers';
import { sortChatItems, type ChatItem } from '@/utils/chatListSort';

function userCityId(): string | undefined {
  const user = useAuthStore.getState().user;
  return user?.currentCity?.id ?? user?.currentCityId;
}

export function usersChatItemsIncludeCityGroup(chats: ChatItem[], cityId: string): boolean {
  return chats.some(
    (c) =>
      (c.type === 'group' || c.type === 'channel') &&
      c.data.id === cityId &&
      !!(c.data as { isCityGroup?: boolean }).isCityGroup
  );
}

/** City group is paginated out of page-1 groups; include it before first paint. */
export async function ensureCityGroupInUsersChatItems(
  chats: ChatItem[],
  userId: string,
  opts?: { allDrafts?: ChatDraft[]; fetchIfMissing?: boolean }
): Promise<ChatItem[]> {
  const cityId = userCityId();
  if (!cityId || usersChatItemsIncludeCityGroup(chats, cityId)) {
    return chats;
  }

  const fromDex = await loadThreadIndexItemForContext('GROUP', cityId);
  if (fromDex && (fromDex.type === 'group' || fromDex.type === 'channel')) {
    return sortChatItems(deduplicateChats([...chats, fromDex]), 'users', userId);
  }

  if (opts?.fetchIfMissing === false) {
    return chats;
  }

  try {
    const res = await chatApi.getGroupChannelById(cityId);
    const gc = res.data;
    if (!gc?.isCityGroup) return chats;
    const allDrafts = opts?.allDrafts ?? [];
    const groupUnreads = await resolveGroupUnreadCounts([gc.id]);
    const items = groupsToChatItems([gc], groupUnreads, allDrafts, 'users', userId);
    if (items.length === 0) return chats;
    return sortChatItems(deduplicateChats([...chats, ...items]), 'users', userId);
  } catch {
    return chats;
  }
}
