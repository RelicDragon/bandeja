import type { ChatsFilterType } from '@/components/chat/chatListFeedStore';

export function shouldFetchMarketForUnknownGroupUnread(
  chatsFilter: ChatsFilterType,
  data: { contextType?: string; contextId?: string } | null | undefined,
  marketChannelIds: string[],
  alreadyFetchedContextId: string | null
): boolean {
  if (chatsFilter !== 'market') return false;
  if (!data || data.contextType !== 'GROUP' || !data.contextId) return false;
  if (marketChannelIds.includes(data.contextId)) return false;
  if (alreadyFetchedContextId === data.contextId) return false;
  return true;
}
