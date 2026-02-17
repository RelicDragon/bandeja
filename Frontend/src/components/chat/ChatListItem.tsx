import { UserChatCard } from './UserChatCard';
import { GroupChannelCard } from './GroupChannelCard';
import { UserChat } from '@/api/chat';
import { ChatItem, ChatType } from './chatListTypes';
import { usePlayersStore } from '@/store/playersStore';
import { useAuthStore } from '@/store/authStore';

interface ChatListItemProps {
  item: ChatItem;
  selectedChatId?: string | null;
  selectedChatType?: ChatType | null;
  onChatClick: (chatId: string, chatType: ChatType, options?: { searchQuery?: string }) => void;
  onContactClick: (userId: string) => void;
  isSearchMode?: boolean;
  searchQuery?: string;
  displayTitle?: string;
  displaySubtitle?: string;
  sellerGroupedByItem?: boolean;
}

export const ChatListItem = ({
  item,
  selectedChatId,
  selectedChatType,
  onChatClick,
  onContactClick,
  isSearchMode = false,
  searchQuery = '',
  displayTitle,
  displaySubtitle,
  sellerGroupedByItem,
}: ChatListItemProps) => {
  const { user } = useAuthStore();
  const liveChats = usePlayersStore((state) => state.chats);
  const liveUnreadCounts = usePlayersStore((state) => state.unreadCounts);

  const clickOpts = isSearchMode && searchQuery ? { searchQuery } : undefined;
  const chat = item;

  if (chat.type === 'user') {
    const liveChat = liveChats[chat.data.id] || chat.data;
    const liveUnreadCount = liveUnreadCounts[chat.data.id] || 0;
    const isSelected = selectedChatType === 'user' && selectedChatId === chat.data.id;
    return (
      <UserChatCard
        key={`user-${chat.data.id}`}
        chat={liveChat}
        unreadCount={liveUnreadCount}
        onClick={() => onChatClick(chat.data.id, 'user', clickOpts)}
        isSelected={isSelected}
        draft={chat.draft}
      />
    );
  }

  if (chat.type === 'contact') {
    const mockChat: UserChat = {
      id: '',
      user1Id: user?.id || '',
      user2Id: chat.userId,
      user1allowed: true,
      user2allowed: true,
      user1: user!,
      user2: chat.user,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return (
      <UserChatCard
        key={`contact-${chat.userId}`}
        chat={mockChat}
        unreadCount={0}
        onClick={() => onContactClick(chat.userId)}
        isSelected={false}
      />
    );
  }

  if (chat.type === 'group' || chat.type === 'channel') {
    const chatTypeForNav: ChatType = chat.type === 'channel' ? 'channel' : 'group';
    const isSelected = (selectedChatType === 'group' || selectedChatType === 'channel') && selectedChatId === chat.data.id;
    return (
      <div
        key={`${chat.type}-${chat.data.id}`}
        className={`border-b border-gray-200 dark:border-gray-700 last:border-b-0 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
      >
        <GroupChannelCard
          groupChannel={chat.data}
          unreadCount={chat.unreadCount}
          onClick={() => onChatClick(chat.data.id, chatTypeForNav, clickOpts)}
          isSelected={isSelected}
          draft={chat.draft}
          displayTitle={displayTitle}
          displaySubtitle={displaySubtitle}
          sellerGroupedByItem={sellerGroupedByItem}
        />
      </div>
    );
  }

  return null;
};
