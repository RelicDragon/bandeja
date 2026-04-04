import { UserChat, GroupChannel, ChatDraft } from '@/api/chat';
import { BasicUser, Game } from '@/types';

export type ChatListOutbox = {
  state: 'queued' | 'sending' | 'failed';
  preview?: string;
  previewKind?: 'text' | 'voice' | 'media';
};

export type ChatItem =
  | {
      type: 'user';
      data: UserChat;
      lastMessageDate: Date | null;
      unreadCount: number;
      otherUser?: BasicUser;
      draft?: ChatDraft | null;
      listOutbox?: ChatListOutbox | null;
    }
  | { type: 'contact'; userId: string; user: BasicUser; interactionCount: number; isFavorite: boolean; lastMessageDate: null }
  | {
      type: 'group';
      data: GroupChannel;
      lastMessageDate: Date | null;
      unreadCount: number;
      draft?: ChatDraft | null;
      listOutbox?: ChatListOutbox | null;
    }
  | {
      type: 'channel';
      data: GroupChannel;
      lastMessageDate: Date | null;
      unreadCount: number;
      draft?: ChatDraft | null;
      listOutbox?: ChatListOutbox | null;
    }
  | {
      type: 'game';
      data: Game;
      lastMessageDate: Date | null;
      unreadCount: number;
      listOutbox?: ChatListOutbox | null;
    };

export const getChatTitle = (chat: ChatItem, currentUserId: string): string => {
  if (chat.type === 'user') {
    const otherUser = chat.data.user1Id === currentUserId ? chat.data.user2 : chat.data.user1;
    return `${otherUser?.firstName || ''} ${otherUser?.lastName || ''}`.trim() || 'Unknown';
  } else if (chat.type === 'contact') {
    return `${chat.user.firstName || ''} ${chat.user.lastName || ''}`.trim() || 'Unknown';
  } else if (chat.type === 'group' || chat.type === 'channel') {
    return chat.data.name || '';
  } else if (chat.type === 'game') {
    return chat.data.name?.trim() || '';
  }
  return '';
};

const sortByActivity = (a: ChatItem, b: ChatItem, getTitle: (c: ChatItem) => string): number => {
  const aTime = a.lastMessageDate ? a.lastMessageDate.getTime() : null;
  const bTime = b.lastMessageDate ? b.lastMessageDate.getTime() : null;

  if (aTime === null && bTime === null) {
    return getTitle(a).toLowerCase().localeCompare(getTitle(b).toLowerCase());
  }
  if (aTime === null) return 1;
  if (bTime === null) return -1;
  if (bTime !== aTime) return bTime - aTime;

  return getTitle(a).toLowerCase().localeCompare(getTitle(b).toLowerCase());
};

const sortForBugsChannels = (a: ChatItem, b: ChatItem): number => {
  const aTime = a.lastMessageDate ? a.lastMessageDate.getTime() : null;
  const bTime = b.lastMessageDate ? b.lastMessageDate.getTime() : null;

  if (aTime === null && bTime === null) return 0;
  if (aTime === null) return 1;
  if (bTime === null) return -1;
  if (bTime !== aTime) return bTime - aTime;

  const hasUnread = (item: ChatItem) =>
    (item.type === 'user' || item.type === 'group' || item.type === 'channel' || item.type === 'game') && item.unreadCount > 0;
  if (hasUnread(a) && !hasUnread(b)) return -1;
  if (!hasUnread(a) && hasUnread(b)) return 1;

  if (a.type === 'channel' && b.type === 'channel') {
    return a.data.name.localeCompare(b.data.name);
  }
  return 0;
};

const isPinned = (item: ChatItem): boolean => {
  if (item.type === 'user' || item.type === 'group' || item.type === 'channel') {
    return !!item.data.isPinned;
  }
  return false;
};

const getPinnedAt = (item: ChatItem): string | null => {
  if (item.type === 'user' || item.type === 'group' || item.type === 'channel') {
    return item.data.pinnedAt ?? null;
  }
  return null;
};

const isCityGroupItem = (item: ChatItem): boolean =>
  (item.type === 'group' || item.type === 'channel') && !!(item.data as GroupChannel).isCityGroup;

function sortPinnedThenUnpinned(items: ChatItem[], userId?: string): ChatItem[] {
  const pinned = items.filter(isPinned);
  const unpinned = items.filter((c) => !isPinned(c));
  pinned.sort((a, b) => {
    const aAt = getPinnedAt(a);
    const bAt = getPinnedAt(b);
    if (!aAt && !bAt) return 0;
    if (!aAt) return 1;
    if (!bAt) return -1;
    return new Date(aAt).getTime() - new Date(bAt).getTime();
  });
  if (userId) unpinned.sort((a, b) => sortByActivity(a, b, (c) => getChatTitle(c, userId)));
  return [...pinned, ...unpinned];
}

export const sortChatItems = (
  items: ChatItem[],
  filter: 'users' | 'bugs' | 'channels' | 'market',
  userId?: string
): ChatItem[] => {
  if (!items.length) return items;
  if (filter === 'users') {
    const cityGroups = items.filter(isCityGroupItem);
    const rest = items.filter((c) => !isCityGroupItem(c));
    return [...sortPinnedThenUnpinned(cityGroups, userId), ...sortPinnedThenUnpinned(rest, userId)];
  }
  const pinned = items.filter(isPinned);
  const unpinned = items.filter((c) => !isPinned(c));
  pinned.sort((a, b) => {
    const aAt = getPinnedAt(a);
    const bAt = getPinnedAt(b);
    if (!aAt && !bAt) return 0;
    if (!aAt) return 1;
    if (!bAt) return -1;
    return new Date(aAt).getTime() - new Date(bAt).getTime();
  });
  if (filter === 'bugs' || filter === 'channels' || filter === 'market') {
    unpinned.sort(sortForBugsChannels);
  }
  return [...pinned, ...unpinned];
};
