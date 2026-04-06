import { UserChatCard } from './UserChatCard';
import { GroupChannelCard } from './GroupChannelCard';
import { ChatListOutboxAnimated } from './ChatListOutboxAnimated';
import { UserChat } from '@/api/chat';
import { ChatItem, ChatType } from './chatListTypes';
import { usePlayersStore } from '@/store/playersStore';
import { useAuthStore } from '@/store/authStore';
import { MAX_PINNED_CHATS } from '@/utils/chatListConstants';
import { getChatTitle } from '@/utils/chatListSort';
import { formatRelativeTime } from '@/utils/dateFormat';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import {
  dismissFailedOutboxForContext,
  retryFailedOutboxForContext,
} from '@/services/chat/chatOutboxContextActions';

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
  pinnedCount?: number;
  pinningId?: string | null;
  onPinUserChat?: (chatId: string, isPinned: boolean) => void;
  onPinGroupChannel?: (channelId: string, isPinned: boolean) => void;
  mutedChats?: Record<string, boolean>;
  togglingMuteId?: string | null;
  onMuteUserChat?: (chatId: string, isMuted: boolean) => void;
  onMuteGroupChannel?: (channelId: string, isMuted: boolean) => void;
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
  pinnedCount = 0,
  pinningId = null,
  onPinUserChat,
  onPinGroupChannel,
  mutedChats = {},
  togglingMuteId = null,
  onMuteUserChat,
  onMuteGroupChannel,
}: ChatListItemProps) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const liveChats = usePlayersStore((state) => state.chats);
  const liveUnreadCounts = usePlayersStore((state) => state.unreadCounts);

  const clickOpts = isSearchMode && searchQuery ? { searchQuery } : undefined;
  const chat = item;

  if (chat.type === 'user') {
    const liveChat = liveChats[chat.data.id] || chat.data;
    const liveUnreadCount = liveUnreadCounts[chat.data.id] || 0;
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
        unreadCount={liveUnreadCount}
        onClick={() => onChatClick(chat.data.id, 'user', clickOpts)}
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
        unreadCount={0}
        onClick={() => onContactClick(chat.userId)}
        isSelected={false}
      />
    );
  }

  if (chat.type === 'game') {
    const isSelected = selectedChatType === 'game' && selectedChatId === chat.data.id;
    const title = user ? getChatTitle(chat, user.id) : chat.data.name?.trim() || '';
    const subtitle =
      chat.lastMessageDate != null ? formatRelativeTime(chat.lastMessageDate.toISOString()) : null;
    const listOutbox = 'listOutbox' in chat ? chat.listOutbox ?? undefined : undefined;
    return (
      <button
        type="button"
        key={`game-${chat.data.id}`}
        onClick={() => onChatClick(chat.data.id, 'game', clickOpts)}
        className={`w-full text-left border-b border-gray-200 dark:border-gray-700 last:border-b-0 px-4 py-3 flex flex-col gap-0.5 transition-colors ${
          isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
        }`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 w-11 h-11 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-600 dark:text-primary-300">
            <Trophy className="w-5 h-5" aria-hidden />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-gray-900 dark:text-gray-100 truncate flex-1 text-left">
                {title || t('chat.game', { defaultValue: 'Game' })}
              </span>
              {subtitle ? (
                <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{subtitle}</span>
              ) : null}
              {chat.unreadCount > 0 ? (
                <span className="shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary-500 text-white text-xs font-semibold flex items-center justify-center">
                  {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                </span>
              ) : null}
            </div>
            <ChatListOutboxAnimated
              listOutbox={listOutbox}
              onRetry={
                listOutbox?.state === 'failed'
                  ? () => {
                      void retryFailedOutboxForContext('GAME', chat.data.id);
                    }
                  : undefined
              }
              onDismiss={
                listOutbox?.state === 'failed'
                  ? () => {
                      void dismissFailedOutboxForContext('GAME', chat.data.id);
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </button>
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
          unreadCount={chat.unreadCount}
          onClick={() => onChatClick(chat.data.id, chatTypeForNav, clickOpts)}
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
