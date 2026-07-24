import type { TFunction } from 'i18next';
import { chatApi, type ChatContextType, type GroupChannel, type UserChat } from '@/api/chat';
import type { ChatItem } from '@/utils/chatListSort';
import { getChatTitle } from '@/utils/chatListSort';
import {
  channelsToChatItems,
  gamesToChatItems,
  groupsToChatItems,
} from '@/utils/chatListHelpers';
import { parseMessagePreview } from '@/utils/messagePreview';
import { isGroupChannelAdminOrOwner } from '@/utils/gameResults';
import { mapThreadIndexRowsToSortedChatItems } from '@/services/chat/chatThreadIndex';
import { chatLocalDb } from '@/services/chat/chatLocalDb';

export type ForwardDestination = {
  contextType: ChatContextType;
  contextId: string;
  title: string;
  kind: 'user' | 'group' | 'channel' | 'game';
  preview: string;
  item: Exclude<ChatItem, { type: 'contact' }>;
};

const MAX_GROUP_PAGES = 20;

function lastPreviewText(lm: unknown, t: TFunction): string {
  if (!lm || typeof lm !== 'object' || !('preview' in lm)) return '';
  const parsed = parseMessagePreview((lm as { preview?: string }).preview ?? null, t);
  return parsed && parsed !== '[Media]' ? parsed : '';
}

export function canWriteToForwardChannel(channel: GroupChannel, userId: string): boolean {
  if (channel.isChannel) {
    if (channel.isOwner === true) return true;
    return isGroupChannelAdminOrOwner(channel, userId);
  }
  if (channel.isParticipant === false) return false;
  return true;
}

export function chatItemToForwardDestination(
  item: ChatItem,
  userId: string,
  t: TFunction
): ForwardDestination | null {
  if (item.type === 'user') {
    return {
      contextType: 'USER',
      contextId: item.data.id,
      title: getChatTitle(item, userId) || '—',
      kind: 'user',
      preview: lastPreviewText(item.data.lastMessage, t),
      item,
    };
  }
  if (item.type === 'group') {
    return {
      contextType: 'GROUP',
      contextId: item.data.id,
      title: item.data.name?.trim() || '—',
      kind: 'group',
      preview: lastPreviewText(item.data.lastMessage, t),
      item,
    };
  }
  if (item.type === 'channel') {
    if (!canWriteToForwardChannel(item.data, userId)) return null;
    return {
      contextType: 'GROUP',
      contextId: item.data.id,
      title: item.data.name?.trim() || '—',
      kind: item.data.isChannel ? 'channel' : 'group',
      preview: lastPreviewText(item.data.lastMessage, t),
      item,
    };
  }
  if (item.type === 'game') {
    if (item.data.status === 'ARCHIVED') return null;
    return {
      contextType: 'GAME',
      contextId: item.data.id,
      title: item.data.name?.trim() || '—',
      kind: 'game',
      preview: lastPreviewText(item.data.lastMessage, t),
      item,
    };
  }
  return null;
}

export function destinationsFromChatItems(
  items: ChatItem[],
  userId: string,
  t: TFunction,
  exclude?: { contextType: ChatContextType | null; contextId: string | null }
): ForwardDestination[] {
  const seen = new Set<string>();
  const out: ForwardDestination[] = [];
  for (const item of items) {
    const d = chatItemToForwardDestination(item, userId, t);
    if (!d) continue;
    if (exclude?.contextType && d.contextType === exclude.contextType && d.contextId === exclude.contextId) {
      continue;
    }
    const key = `${d.contextType}:${d.contextId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

function destKey(d: ForwardDestination): string {
  return `${d.contextType}:${d.contextId}`;
}

/** Local order first; network fills gaps and refreshes `item` (avatars) on matches. */
export function mergeForwardDestinations(
  base: ForwardDestination[],
  extra: ForwardDestination[]
): ForwardDestination[] {
  const byKey = new Map(base.map((d) => [destKey(d), d]));
  const order = base.map(destKey);
  for (const d of extra) {
    const key = destKey(d);
    const prev = byKey.get(key);
    if (prev) {
      byKey.set(key, {
        ...prev,
        title: d.title || prev.title,
        preview: d.preview || prev.preview,
        item: d.item,
        kind: d.kind,
      });
    } else {
      byKey.set(key, d);
      order.push(key);
    }
  }
  return order.map((k) => byKey.get(k)!);
}

export async function loadLocalForwardChatItems(): Promise<ChatItem[]> {
  const rows = await chatLocalDb.threadIndex.toArray();
  return mapThreadIndexRowsToSortedChatItems(rows);
}

async function fetchAllGroupPages(
  filter: 'users' | 'channels' | 'market'
): Promise<GroupChannel[]> {
  const all: GroupChannel[] = [];
  for (let page = 1; page <= MAX_GROUP_PAGES; page++) {
    const { data, pagination } = await chatApi.getGroupChannels(filter, page);
    all.push(...((data || []) as GroupChannel[]));
    if (!pagination?.hasMore) break;
  }
  return all;
}

function userChatsToChatItems(chats: UserChat[], userId: string, blockedUserIds: string[]): ChatItem[] {
  const items: ChatItem[] = [];
  for (const chat of chats) {
    const otherUserId = chat.user1Id === userId ? chat.user2Id : chat.user1Id;
    const otherUser = chat.user1Id === userId ? chat.user2 : chat.user1;
    if (!otherUserId || blockedUserIds.includes(otherUserId)) continue;
    items.push({
      type: 'user',
      data: chat,
      lastMessageDate: chat.lastMessage ? new Date(chat.lastMessage.updatedAt) : null,
      unreadCount: 0,
      otherUser,
      draft: null,
    });
  }
  return items;
}

/** Fresh API snapshot: DMs + groups + games + channels + market. */
export async function loadNetworkForwardChatItems(
  userId: string,
  blockedUserIds: string[] = []
): Promise<ChatItem[]> {
  const emptyUnreads: Record<string, number> = {};
  const [userChatsRes, usersGroups, channels, market, games] = await Promise.all([
    chatApi.getUserChats(),
    fetchAllGroupPages('users'),
    fetchAllGroupPages('channels'),
    fetchAllGroupPages('market'),
    chatApi.getUserChatGames(),
  ]);

  const userChats = (userChatsRes.data ?? []) as UserChat[];
  const items: ChatItem[] = [
    ...userChatsToChatItems(userChats, userId, blockedUserIds),
    ...groupsToChatItems(usersGroups, emptyUnreads, [], 'users', userId),
    ...gamesToChatItems(games, emptyUnreads, []),
    ...channelsToChatItems(channels, emptyUnreads, 'channels', {
      filterByIsChannel: true,
      allDrafts: [],
    }),
    ...channelsToChatItems(market, emptyUnreads, 'market', {
      filterByIsGroup: true,
      useUpdatedAtFallback: true,
      allDrafts: [],
    }),
  ];
  return items;
}
