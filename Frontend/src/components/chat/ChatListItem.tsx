import { memo, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { UserChatCard } from './UserChatCard';
import { GroupChannelCard } from './GroupChannelCard';
import { UserChat } from '@/api/chat';
import { ChatItem, ChatSelectNavOptions, ChatType } from './chatListTypes';
import { usePlayersStore } from '@/store/playersStore';
import { useChatListItemUnread } from '@/hooks/useUnreadBridge';
import { useAuthStore } from '@/store/authStore';
import { MAX_PINNED_CHATS } from '@/utils/chatListConstants';
import { ChatListGameCard } from './ChatListGameCard';
import { ChatListSwipeRow, type ChatListSwipeAction } from './ChatListSwipeRow';
import { BellOff, BellRing, Pin, PinOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  dismissFailedOutboxForContext,
  retryFailedOutboxForContext,
} from '@/services/chat/chatOutboxContextActions';
import { prefetchChatThreadFromListHover } from '@/services/chat/chatListHoverPrefetch';

const USER_ROW_STORE_EMPTY = Object.freeze({
  live: undefined as UserChat | undefined,
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
  /** Game rows only: the "Next up" card / dimmed past row. */
  gameVariant?: 'row' | 'hero';
  gamePast?: boolean;
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
  gameVariant = 'row',
  gamePast = false,
}: ChatListItemProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const listItemUnread = useChatListItemUnread(item);
  const userChatId = item.type === 'user' ? item.data.id : '';
  const { live: liveFromStore } = usePlayersStore(
    useShallow((s) =>
      userChatId ? { live: s.chats[userChatId] } : USER_ROW_STORE_EMPTY
    )
  );

  const chat = item;
  /** Stable identities below keep the memoized row cards from re-rendering on unrelated list renders. */
  const clickOpts = useMemo(
    () => (isSearchMode && searchQuery ? { searchQuery } : undefined),
    [isSearchMode, searchQuery]
  );
  const liveUserChat = chat.type === 'user' ? liveFromStore ?? chat.data : undefined;
  const rowId = chat.type === 'contact' ? chat.userId : chat.data.id;
  const rowPinned =
    chat.type === 'user'
      ? !!liveUserChat?.isPinned
      : chat.type === 'group' || chat.type === 'channel'
        ? !!chat.data.isPinned
        : false;
  const storeMuted =
    chat.type === 'user'
      ? !!liveUserChat?.isMuted
      : chat.type === 'group' || chat.type === 'channel'
        ? !!chat.data.isMuted
        : false;
  const rowMuted = mutedChats && rowId in mutedChats ? !!mutedChats[rowId] : storeMuted;
  const listOutbox = 'listOutbox' in chat ? chat.listOutbox ?? undefined : undefined;
  const outboxFailed = listOutbox?.state === 'failed';

  const onRowHover = useCallback(() => {
    void prefetchChatThreadFromListHover(chat);
  }, [chat]);

  const handleRowClick = useCallback(() => {
    if (chat.type === 'contact') {
      onContactClick(chat.userId);
      return;
    }
    if (chat.type === 'user') {
      onChatClick(chat.data.id, 'user', { ...clickOpts, userChat: liveUserChat ?? chat.data });
      return;
    }
    if (chat.type === 'game') {
      onChatClick(chat.data.id, 'game', clickOpts);
      return;
    }
    const chatTypeForNav: ChatType = chat.type === 'channel' ? 'channel' : 'group';
    onChatClick(chat.data.id, chatTypeForNav, { ...clickOpts, groupChannel: chat.data });
  }, [chat, clickOpts, liveUserChat, onChatClick, onContactClick]);

  const handleOutboxRetry = useCallback(() => {
    if (chat.type === 'user') void retryFailedOutboxForContext('USER', chat.data.id);
    else if (chat.type === 'group' || chat.type === 'channel')
      void retryFailedOutboxForContext('GROUP', chat.data.id);
  }, [chat]);

  const handleOutboxDismiss = useCallback(() => {
    if (chat.type === 'user') void dismissFailedOutboxForContext('USER', chat.data.id);
    else if (chat.type === 'group' || chat.type === 'channel')
      void dismissFailedOutboxForContext('GROUP', chat.data.id);
  }, [chat]);

  const handlePinToggle = useCallback(() => {
    if (chat.type === 'user') onPinUserChat?.(chat.data.id, rowPinned);
    else if (chat.type === 'group' || chat.type === 'channel')
      onPinGroupChannel?.(chat.data.id, rowPinned);
  }, [chat, rowPinned, onPinUserChat, onPinGroupChannel]);

  const handleMuteToggle = useCallback(() => {
    if (chat.type === 'user') onMuteUserChat?.(chat.data.id, rowMuted);
    else if (chat.type === 'group' || chat.type === 'channel')
      onMuteGroupChannel?.(chat.data.id, rowMuted);
  }, [chat, rowMuted, onMuteUserChat, onMuteGroupChannel]);

  const canPinRow =
    chat.type === 'user'
      ? !!onPinUserChat
      : (chat.type === 'group' || chat.type === 'channel') && !chat.data.isCityGroup && !!onPinGroupChannel;
  const canMuteRow =
    chat.type === 'user' ? !!onMuteUserChat : (chat.type === 'group' || chat.type === 'channel') && !!onMuteGroupChannel;
  const pinAllowed = pinnedCount < MAX_PINNED_CHATS || rowPinned;
  const swipeActions = useMemo((): ChatListSwipeAction[] => {
    const out: ChatListSwipeAction[] = [];
    if (canMuteRow) {
      out.push({
        id: 'mute',
        label: rowMuted ? t('chat.list.unmuteShort', { defaultValue: 'Unmute' }) : t('chat.list.muteShort', { defaultValue: 'Mute' }),
        Icon: rowMuted ? BellRing : BellOff,
        onClick: handleMuteToggle,
        className: 'bg-slate-500 dark:bg-slate-600',
        disabled: togglingMuteId === rowId,
      });
    }
    if (canPinRow) {
      out.push({
        id: 'pin',
        label: rowPinned ? t('chat.list.unpinShort', { defaultValue: 'Unpin' }) : t('chat.list.pinShort', { defaultValue: 'Pin' }),
        Icon: rowPinned ? PinOff : Pin,
        onClick: handlePinToggle,
        className: 'bg-amber-500 dark:bg-amber-600',
        disabled: !pinAllowed || pinningId === rowId,
      });
    }
    return out;
  }, [canMuteRow, canPinRow, rowMuted, rowPinned, pinAllowed, togglingMuteId, pinningId, rowId, handleMuteToggle, handlePinToggle, t]);
  const swipeKey = `${chat.type}-${rowId}`;

  const contactMockChat = useMemo((): UserChat | null => {
    if (chat.type !== 'contact') return null;
    const now = new Date().toISOString();
    return {
      id: '',
      user1Id: user?.id || '',
      user2Id: chat.userId,
      user1allowed: true,
      user2allowed: true,
      user1: user!,
      user2: chat.user,
      createdAt: now,
      updatedAt: now,
    };
  }, [chat, user]);

  if (chat.type === 'user') {
    const liveChat = liveUserChat ?? chat.data;
    const isSelected = selectedChatType === 'user' && selectedChatId === chat.data.id;
    return (
      <ChatListSwipeRow rowKey={swipeKey} actions={swipeActions}>
      <UserChatCard
        chat={liveChat}
        listPresenceBatched={listPresenceBatched}
        unreadCount={listItemUnread}
        onClick={handleRowClick}
        onMouseEnter={onRowHover}
        isSelected={isSelected}
        draft={chat.draft}
        listOutbox={listOutbox}
        onOutboxRetry={outboxFailed ? handleOutboxRetry : undefined}
        onOutboxDismiss={outboxFailed ? handleOutboxDismiss : undefined}
        isPinned={rowPinned}
        onPinToggle={onPinUserChat ? handlePinToggle : undefined}
        canPin={pinnedCount < MAX_PINNED_CHATS || rowPinned}
        isPinning={pinningId === chat.data.id}
        isMuted={rowMuted}
        onMuteToggle={onMuteUserChat ? handleMuteToggle : undefined}
        isTogglingMute={togglingMuteId === chat.data.id}
      />
      </ChatListSwipeRow>
    );
  }

  if (chat.type === 'contact') {
    return (
      <UserChatCard
        chat={contactMockChat!}
        listPresenceBatched={listPresenceBatched}
        unreadCount={0}
        onClick={handleRowClick}
        isSelected={false}
      />
    );
  }

  if (chat.type === 'game') {
    const isSelected = selectedChatType === 'game' && selectedChatId === chat.data.id;
    return (
      <div onMouseEnter={onRowHover}>
        <ChatListGameCard
          chat={chat}
          currentUserId={user?.id}
          isSelected={isSelected}
          onClick={handleRowClick}
          variant={gameVariant}
          past={gamePast}
        />
      </div>
    );
  }

  if (chat.type === 'group' || chat.type === 'channel') {
    const isSelected = (selectedChatType === 'group' || selectedChatType === 'channel') && selectedChatId === chat.data.id;
    return (
      <ChatListSwipeRow rowKey={swipeKey} actions={swipeActions}>
      <div onMouseEnter={onRowHover}>
        <GroupChannelCard
          groupChannel={chat.data}
          listPresenceBatched={listPresenceBatched}
          unreadCount={listItemUnread}
          onClick={handleRowClick}
          isSelected={isSelected}
          draft={chat.draft}
          listOutbox={listOutbox}
          onOutboxRetry={outboxFailed ? handleOutboxRetry : undefined}
          onOutboxDismiss={outboxFailed ? handleOutboxDismiss : undefined}
          displayTitle={displayTitle}
          displaySubtitle={displaySubtitle}
          sellerGroupedByItem={sellerGroupedByItem}
          isPinned={rowPinned}
          onPinToggle={chat.data.isCityGroup ? undefined : (onPinGroupChannel ? handlePinToggle : undefined)}
          canPin={chat.data.isCityGroup ? true : (pinnedCount < MAX_PINNED_CHATS || rowPinned)}
          isPinning={pinningId === chat.data.id}
          isMuted={rowMuted}
          onMuteToggle={onMuteGroupChannel ? handleMuteToggle : undefined}
          isTogglingMute={togglingMuteId === chat.data.id}
        />
      </div>
      </ChatListSwipeRow>
    );
  }

  return null;
};

export const ChatListItem = memo(ChatListItemInner);
