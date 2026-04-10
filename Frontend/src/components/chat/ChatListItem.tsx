import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { UserChatCard } from './UserChatCard';
import { GroupChannelCard } from './GroupChannelCard';
import { UserChat } from '@/api/chat';
import { ChatItem, ChatSelectNavOptions, ChatType } from './chatListTypes';
import { usePlayersStore } from '@/store/playersStore';
import { useAuthStore } from '@/store/authStore';
import { MAX_PINNED_CHATS } from '@/utils/chatListConstants';
import { ChatListGameCard } from './ChatListGameCard';
import {
  dismissFailedOutboxForContext,
  retryFailedOutboxForContext,
} from '@/services/chat/chatOutboxContextActions';

const USER_ROW_STORE_EMPTY = Object.freeze({
  live: undefined as UserChat | undefined,
  unread: 0,
});

interface ChatListItemProps {
  item: ChatItem;
  listPresenceBatched?: boolean;
  selectedChatId?: string | null;
  selectedChatType?: ChatType | null;
  onChatClick: (chatId: string, chatType: ChatType, options?: ChatSelectNavOptions) => void;
  onContactClick: (userId: string) => void;
  isSearchMode?: boolean;
  searchQuery?: string;
  displayTitle?: string;
  displaySubtitle?: string;
  sellerGroupedByItem?: boolean;
  pinnedCount?: number;
  pinningId?: string | null;
  onPinUserChat?: (chatId: string, isPinned: boolean) => void;
  onPinGroupChannel?: (channelId: string, isPinned: boolean) => void;
  mutedChats?: Record<string, boolean>;
  togglingMuteId?: string | null;
  onMuteUserChat?: (chatId: string, isMuted: boolean) => void;
  onMuteGroupChannel?: (channelId: string, isMuted: boolean) => void;
}

const ChatListItemInner = ({
  item,
  listPresenceBatched = false,
  selectedChatId,
  selectedChatType,
  onChatClick,
  onContactClick,
  isSearchMode = false,
  searchQuery = '',
  displayTitle,
  displaySubtitle,
  sellerGroupedByItem,
  pinnedCount = 0,
  pinningId = null,
  onPinUserChat,
  onPinGroupChannel,
  mutedChats = {},
  togglingMuteId = null,
  onMuteUserChat,
  onMuteGroupChannel,
}: ChatListItemProps) => {
  const { user } = useAuthStore();
  const userChatId = item.type === 'user' ? item.data.id : '';
  const { live: liveFromStore, unread: unreadFromStore } = usePlayersStore(
    useShallow((s) =>
      userChatId
        ? { live: s.chats[userChatId], unread: s.unreadCounts[userChatId] ?? 0 }
        : USER_ROW_STORE_EMPTY
    )
  );

  const clickOpts = isSearchMode && searchQuery ? { searchQuery } : undefined;
  const chat = item;

  if (chat.type === 'user') {
    const liveChat = liveFromStore || chat.data;
    const liveUnreadCount = unreadFromStore;
    const isSelected = selectedChatType === 'user' && selectedChatId === chat.data.id;
    const isPinned = !!liveChat.isPinned;
    const isPinning = pinningId === chat.data.id;
    const isMuted =
      mutedChats && chat.data.id in mutedChats ? mutedChats[chat.data.id] : !!liveChat.isMuted;
    const isTogglingMute = togglingMuteId === chat.data.id;
    return (
      <UserChatCard
        key={`user-${chat.data.id}`}
        chat={liveChat}
        listPresenceBatched={listPresenceBatched}
        unreadCount={liveUnreadCount}
        onClick={() => onChatClick(chat.data.id, 'user', { ...clickOpts, userChat: liveChat })}
        isSelected={isSelected}
        draft={chat.draft}
        listOutbox={'listOutbox' in chat ? chat.listOutbox ?? undefined : undefined}
        onOutboxRetry={
          'listOutbox' in chat && chat.listOutbox?.state === 'failed'
            ? () => {
                void retryFailedOutboxForContext('USER', chat.data.id);
              }
            : undefined
        }
        onOutboxDismiss={
          'listOutbox' in chat && chat.listOutbox?.state === 'failed'
            ? () => {
                void dismissFailedOutboxForContext('USER', chat.data.id);
              }
            : undefined
        }
        isPinned={isPinned}
        onPinToggle={onPinUserChat ? () => onPinUserChat(chat.data.id, isPinned) : undefined}
        canPin={pinnedCount < MAX_PINNED_CHATS || isPinned}
        isPinning={isPinning}
        isMuted={isMuted}
        onMuteToggle={onMuteUserChat ? () => onMuteUserChat(chat.data.id, isMuted) : undefined}
        isTogglingMute={isTogglingMute}
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
        listPresenceBatched={listPresenceBatched}
        unreadCount={0}
        onClick={() => onContactClick(chat.userId)}
        isSelected={false}
      />
    );
  }

  if (chat.type === 'game') {
    const isSelected = selectedChatType === 'game' && selectedChatId === chat.data.id;
    return (
      <ChatListGameCard
        key={`game-${chat.data.id}`}
        chat={chat}
        currentUserId={user?.id}
        isSelected={isSelected}
        onClick={() => onChatClick(chat.data.id, 'game', clickOpts)}
      />
    );
  }

  if (chat.type === 'group' || chat.type === 'channel') {
    const chatTypeForNav: ChatType = chat.type === 'channel' ? 'channel' : 'group';
    const isSelected = (selectedChatType === 'group' || selectedChatType === 'channel') && selectedChatId === chat.data.id;
    const isPinned = !!chat.data.isPinned;
    const isPinning = pinningId === chat.data.id;
    const isMuted =
      mutedChats && chat.data.id in mutedChats ? mutedChats[chat.data.id] : !!chat.data.isMuted;
    const isTogglingMute = togglingMuteId === chat.data.id;
    return (
      <div
        key={`${chat.type}-${chat.data.id}`}
        className={`border-b border-gray-200 dark:border-gray-700 last:border-b-0 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
      >
        <GroupChannelCard
          groupChannel={chat.data}
          listPresenceBatched={listPresenceBatched}
          unreadCount={chat.unreadCount}
          onClick={() =>
          onChatClick(chat.data.id, chatTypeForNav, { ...clickOpts, groupChannel: chat.data })
        }
          isSelected={isSelected}
          draft={chat.draft}
          listOutbox={'listOutbox' in chat ? chat.listOutbox ?? undefined : undefined}
          onOutboxRetry={
            'listOutbox' in chat && chat.listOutbox?.state === 'failed'
              ? () => {
                  void retryFailedOutboxForContext('GROUP', chat.data.id);
                }
              : undefined
          }
          onOutboxDismiss={
            'listOutbox' in chat && chat.listOutbox?.state === 'failed'
              ? () => {
                  void dismissFailedOutboxForContext('GROUP', chat.data.id);
                }
              : undefined
          }
          displayTitle={displayTitle}
          displaySubtitle={displaySubtitle}
          sellerGroupedByItem={sellerGroupedByItem}
          isPinned={isPinned}
          onPinToggle={chat.data.isCityGroup ? undefined : (onPinGroupChannel ? () => onPinGroupChannel(chat.data.id, isPinned) : undefined)}
          canPin={chat.data.isCityGroup ? true : (pinnedCount < MAX_PINNED_CHATS || isPinned)}
          isPinning={isPinning}
          isMuted={isMuted}
          onMuteToggle={onMuteGroupChannel ? () => onMuteGroupChannel(chat.data.id, isMuted) : undefined}
          isTogglingMute={isTogglingMute}
        />
      </div>
    );
  }

  return null;
};

export const ChatListItem = memo(ChatListItemInner);
