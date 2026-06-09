import type { ChatDraft } from '@/api/chat';
import type { ChatsFilterType } from '@/components/chat/chatListFeedStore';
import type { ChatItem } from '@/components/chat/chatListTypes';
import {
  applyDraftsToChatItems,
  deduplicateChats,
  getChatKey,
  threadIndexLiveMergeSig,
} from '@/utils/chatListHelpers';
import {
  ensureCityGroupInUsersChatItems,
  resolveUserCityId,
  usersChatItemsIncludeCityGroup,
} from '@/utils/chatListCityGroup';
import { useNetworkStore } from '@/utils/networkStatus';

export function chatListOrderSig(chats: ChatItem[]): string {
  return chats.map((c) => getChatKey(c)).join('\0');
}

export function chatListVisibleApplySig(chats: ChatItem[]): string {
  const unreadSig = chats
    .map((c) => `${getChatKey(c)}:u${'unreadCount' in c ? (c.unreadCount ?? 0) : 0}`)
    .join('\0');
  return `${threadIndexLiveMergeSig(chats)}\0${unreadSig}`;
}

/** Skip network settle paint when city group is already visible and row content is unchanged. */
export function shouldSkipRedundantNetworkVisibleApply(
  visible: ChatItem[],
  incoming: ChatItem[],
  filter: ChatsFilterType
): boolean {
  if (filter !== 'users' || visible.length === 0 || incoming.length === 0) return false;
  const cityId = resolveUserCityId();
  if (!cityId) return false;
  if (!usersChatItemsIncludeCityGroup(visible, cityId)) return false;
  if (!usersChatItemsIncludeCityGroup(incoming, cityId)) return false;
  return chatListVisibleApplySig(visible) === chatListVisibleApplySig(incoming);
}

export async function prepareChatsForVisibleApply(
  chats: ChatItem[],
  filter: ChatsFilterType,
  userId: string,
  allDrafts: ChatDraft[],
  resortDrafts: boolean
): Promise<ChatItem[]> {
  let prepared = deduplicateChats(chats);
  if (filter === 'users') {
    prepared = await ensureCityGroupInUsersChatItems(prepared, userId, {
      allDrafts,
      fetchIfMissing: useNetworkStore.getState().isOnline,
    });
  }
  return applyDraftsToChatItems(prepared, allDrafts, filter, userId, resortDrafts);
}

/** Dex games-only slice → first paint list with city group at top (screenshot scenario). */
export async function prepareUsersTabDexFirstPaint(
  fromUsersDex: ChatItem[],
  fromGamesDex: ChatItem[],
  userId: string,
  allDrafts: ChatDraft[]
): Promise<ChatItem[]> {
  const { mergeDexThreadIndexForUsersTab } = await import('@/utils/chatListDexMerge');
  const merged = mergeDexThreadIndexForUsersTab(fromUsersDex, fromGamesDex, userId);
  return prepareChatsForVisibleApply(merged, 'users', userId, allDrafts, true);
}
