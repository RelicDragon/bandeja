import { type RefObject } from 'react';
import { ChatListItem } from './ChatListItem';
import { ChatListVirtualSlice } from './ChatListVirtualSlice';
import { getChatKey } from '@/utils/chatListHelpers';
import { getMarketChatDisplayTitle, getMarketChatDisplayParts } from '@/utils/marketChatUtils';
import type { ChatItem, ChatSelectNavOptions, ChatType } from './chatListTypes';
import { CHAT_LIST_CHAT_ROW_ESTIMATE_PX } from '@/utils/chatListConstants';

export type ChatListDisplayedRowsProps = {
  scrollElementRef: RefObject<HTMLDivElement | null>;
  displayedChats: ChatItem[];
  selectedChatId?: string | null;
  selectedChatType?: ChatType | null;
  onChatClick: (chatId: string, chatType: ChatType, options?: ChatSelectNavOptions) => void;
  onContactClick: (userId: string) => void;
  isSearchMode: boolean;
  searchQuery: string;
  chatsFilter: string;
  marketChatRole: 'buyer' | 'seller';
  userId: string | undefined;
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>;
  showLoadMoreRow: boolean;
  loadMoreSpinner: boolean;
  pinnedCountUsers?: number;
  pinningId?: string | null;
  onPinUserChat?: (chatId: string, isPinned: boolean) => void;
  onPinGroupChannel?: (channelId: string, isPinned: boolean) => void;
  mutedChats?: Record<string, boolean>;
  togglingMuteId?: string | null;
  onMuteUserChat?: (chatId: string, isMuted: boolean) => void;
  onMuteGroupChannel?: (channelId: string, isMuted: boolean) => void;
};

function marketRowLabels(chat: Extract<ChatItem, { type: 'channel' }>, userId: string, marketChatRole: 'buyer' | 'seller') {
  if (marketChatRole === 'buyer') {
    const parts = getMarketChatDisplayParts(chat.data, userId, 'buyer');
    return { displayTitle: parts.title, displaySubtitle: parts.subtitle };
  }
  return { displayTitle: getMarketChatDisplayTitle(chat.data, marketChatRole), displaySubtitle: undefined as string | undefined };
}

function chatListRowProps(chat: ChatItem, p: ChatListDisplayedRowsProps) {
  const channelExtras =
    chat.type === 'channel' && p.userId ? marketRowLabels(chat, p.userId, p.marketChatRole) : { displayTitle: undefined as string | undefined, displaySubtitle: undefined as string | undefined };
  return {
    item: chat,
    listPresenceBatched: true as const,
    selectedChatId: p.selectedChatId,
    selectedChatType: p.selectedChatType,
    onChatClick: p.onChatClick,
    onContactClick: p.onContactClick,
    isSearchMode: p.isSearchMode,
    searchQuery: p.searchQuery,
    displayTitle: channelExtras.displayTitle,
    displaySubtitle: channelExtras.displaySubtitle,
    pinnedCount: p.chatsFilter === 'users' ? p.pinnedCountUsers : undefined,
    pinningId: p.chatsFilter === 'users' ? p.pinningId : undefined,
    onPinUserChat: p.chatsFilter === 'users' ? p.onPinUserChat : undefined,
    onPinGroupChannel: p.chatsFilter === 'users' ? p.onPinGroupChannel : undefined,
    mutedChats: p.chatsFilter === 'users' ? p.mutedChats : undefined,
    togglingMuteId: p.chatsFilter === 'users' ? p.togglingMuteId : undefined,
    onMuteUserChat: p.chatsFilter === 'users' ? p.onMuteUserChat : undefined,
    onMuteGroupChannel: p.chatsFilter === 'users' ? p.onMuteGroupChannel : undefined,
  };
}

export function ChatListDisplayedRows(p: ChatListDisplayedRowsProps) {
  const loadMoreBlock =
    p.showLoadMoreRow ? (
      <div ref={p.loadMoreSentinelRef} className="py-4 flex justify-center">
        {p.loadMoreSpinner ? (
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <ChatListVirtualSlice
        scrollElementRef={p.scrollElementRef}
        items={p.displayedChats}
        getItemKey={(chat) => getChatKey(chat)}
        estimateSizePx={CHAT_LIST_CHAT_ROW_ESTIMATE_PX}
        renderItem={(chat) => <ChatListItem {...chatListRowProps(chat, p)} />}
      />
      {loadMoreBlock}
    </>
  );
}
