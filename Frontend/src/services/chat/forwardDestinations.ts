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

export function forwardDestinationKey(d: Pick<ForwardDestination, 'contextType' | 'contextId'>): string {
  return `${d.contextType}:${d.contextId}`;
}

export function canWriteToForwardChannel(channel: GroupChannel, userId: string): boolean {
  if (channel.isChannel) {
    if (channel.isOwner === true) return true;
    return isGroupChannelAdminOrOwner(channel, userId);
  }
  if (channel.isParticipant === false) return false;
  return true;
}

function otherUserIdFromUserChat(chat: UserChat, userId: string): string | null {
  if (chat.user1Id === userId) return chat.user2Id ?? null;
  if (chat.user2Id === userId) return chat.user1Id ?? null;
  return null;
}

/** Drop DMs with blocked peers (local cache does not apply network blocked filter). */
export function filterBlockedForwardDestinations(
  dests: ForwardDestination[],
  userId: string,
  blockedUserIds: readonly string[]
): ForwardDestination[] {
  if (blockedUserIds.length === 0) return dests;
  const blocked = new Set(blockedUserIds);
  return dests.filter((d) => {
    if (d.kind !== 'user' || d.item.type !== 'user') return true;
    const other = otherUserIdFromUserChat(d.item.data, userId);
    return !other || !blocked.has(other);
  });
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
    if (!canWriteToForwardChannel(item.data, userId)) return null;
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
  exclude?: { contextType: ChatContextType | null; contextId: string | null },
  blockedUserIds: readonly string[] = []
): ForwardDestination[] {
  const seen = new Set<string>();
  const out: ForwardDestination[] = [];
  for (const item of items) {
    const d = chatItemToForwardDestination(item, userId, t);
    if (!d) continue;
    if (exclude?.contextType && d.contextType === exclude.contextType && d.contextId === exclude.contextId) {
      continue;
    }
    const key = forwardDestinationKey(d);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return filterBlockedForwardDestinations(out, userId, blockedUserIds);
}

/**
 * Local order first; network refreshes matches and appends gaps.
 * When `networkAuthoritative`, drop local-only DMs (blocked / left chats stale in IDB).
 */
export function mergeForwardDestinations(
  base: ForwardDestination[],
  extra: ForwardDestination[],
  opts?: { networkAuthoritative?: boolean }
): ForwardDestination[] {
  const networkKeys = new Set(extra.map(forwardDestinationKey));
  const local = opts?.networkAuthoritative
    ? base.filter((d) => d.kind !== 'user' || networkKeys.has(forwardDestinationKey(d)))
    : base;

  const byKey = new Map(local.map((d) => [forwardDestinationKey(d), d]));
  const order = local.map(forwardDestinationKey);
  for (const d of extra) {
    const key = forwardDestinationKey(d);
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
