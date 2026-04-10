import type { RefObject } from 'react';
import { ChatListItem } from './ChatListItem';
import { ChatListVirtualSlice } from './ChatListVirtualSlice';
import { getChatKey } from '@/utils/chatListHelpers';
import { getMarketChatDisplayTitleForSellerGrouped } from '@/utils/marketChatUtils';
import type { ChatItem, ChatSelectNavOptions, ChatType } from './chatListTypes';
import {
  CHAT_LIST_CHAT_ROW_ESTIMATE_PX,
  CHAT_LIST_MARKET_GROUP_CHANNEL_THRESHOLD,
} from '@/utils/chatListConstants';

export type ChatListMarketGroupChannelsProps = {
  scrollElementRef: RefObject<HTMLDivElement | null>;
  channels: ChatItem[];
  selectedChatId?: string | null;
  selectedChatType?: ChatType | null;
  onChatClick: (chatId: string, chatType: ChatType, options?: ChatSelectNavOptions) => void;
  onContactClick: (userId: string) => void;
  isSearchMode: boolean;
  searchQuery: string;
};

export function ChatListMarketGroupChannels(p: ChatListMarketGroupChannelsProps) {
  return (
    <ChatListVirtualSlice
      scrollElementRef={p.scrollElementRef}
      items={p.channels}
      getItemKey={(chat) => getChatKey(chat)}
      estimateSizePx={CHAT_LIST_CHAT_ROW_ESTIMATE_PX}
      threshold={CHAT_LIST_MARKET_GROUP_CHANNEL_THRESHOLD}
      renderItem={(chat) => (
        <ChatListItem
          item={chat}
          listPresenceBatched
          selectedChatId={p.selectedChatId}
          selectedChatType={p.selectedChatType}
          onChatClick={p.onChatClick}
          onContactClick={p.onContactClick}
          isSearchMode={p.isSearchMode}
          searchQuery={p.searchQuery}
          displayTitle={getMarketChatDisplayTitleForSellerGrouped(
            (chat as Extract<ChatItem, { type: 'channel' }>).data
          )}
          sellerGroupedByItem
          pinnedCount={undefined}
          pinningId={undefined}
          onPinUserChat={undefined}
          onPinGroupChannel={undefined}
        />
      )}
    />
  );
}
