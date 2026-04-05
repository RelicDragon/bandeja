import type { TFunction } from 'i18next';
import { MessageCircle, Package } from 'lucide-react';

type ChatsFilter = 'users' | 'bugs' | 'channels' | 'market';

type ChatListEmptyPanelProps = {
  chatsFilter: ChatsFilter;
  showContactsEmpty: boolean;
  showChatsEmpty: boolean;
  userHasCity: boolean;
  debouncedSearchQuery: string;
  marketChatRole: 'buyer' | 'seller';
  t: TFunction;
};

export function ChatListEmptyPanel({
  chatsFilter,
  showContactsEmpty,
  showChatsEmpty,
  userHasCity,
  debouncedSearchQuery,
  marketChatRole,
  t,
}: ChatListEmptyPanelProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-[200px] py-12 text-gray-500 dark:text-gray-400">
      {chatsFilter === 'market' ? (
        <Package size={64} className="mb-4 opacity-50" />
      ) : (
        <MessageCircle size={64} className="mb-4 opacity-50" />
      )}
      <p className="text-lg font-medium">
        {showContactsEmpty &&
          (userHasCity
            ? t('chat.noCityUsers', { defaultValue: 'No users in your city' })
            : t('chat.noCitySet', { defaultValue: 'Set your city to see players' }))}
        {showChatsEmpty && chatsFilter !== 'market' && t('chat.noConversations', { defaultValue: 'No conversations yet' })}
      </p>
      <p className="text-sm mt-2">
        {showContactsEmpty && userHasCity && t('chat.noCityUsersHint', { defaultValue: 'Try a different search' })}
        {showChatsEmpty && chatsFilter === 'users' && t('chat.noUserChats', { defaultValue: 'Start chatting with players' })}
        {showChatsEmpty && chatsFilter === 'bugs' && t('chat.noBugChats', { defaultValue: 'No bug reports yet' })}
        {showChatsEmpty && chatsFilter === 'channels' && t('chat.noChannels', { defaultValue: 'No channels yet' })}
        {showChatsEmpty &&
          chatsFilter === 'market' &&
          debouncedSearchQuery.trim() &&
          t('marketplace.noSearchResultsMarketChats', { defaultValue: 'No results for this search' })}
        {showChatsEmpty &&
          chatsFilter === 'market' &&
          !debouncedSearchQuery.trim() &&
          marketChatRole === 'buyer' &&
          t('marketplace.noBuyerChats', { defaultValue: 'No chats as buyer' })}
        {showChatsEmpty &&
          chatsFilter === 'market' &&
          !debouncedSearchQuery.trim() &&
          marketChatRole === 'seller' &&
          t('marketplace.noSellerChats', { defaultValue: 'No chats as seller' })}
      </p>
    </div>
  );
}
