import { PremiumName } from '@/components/PremiumName';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { UnreadBadge } from '@/components/UnreadBadge';
import { formatChatTime } from '@/utils/dateFormat';
import { UserChat, ChatDraft, getLastMessageTime, isLastMessagePreview } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { useViewerLevelSport } from '@/hooks/useViewerLevelSport';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { memo, useMemo } from 'react';
import { ChatListOutboxAnimated } from '@/components/chat/ChatListOutboxAnimated';
import type { ChatListOutbox } from '@/utils/chatListSort';
import { ChatListRowActions } from './ChatListRowActions';
import { ChatListDraftPreview } from './ChatListDraftPreview';
import { ChatListGameLinkStrip } from './ChatListGameLinkStrip';
import { useChatListGameLinkPreview } from './useChatListGameLinkPreview';
import { chatListLastMessageText, chatListPreviewBody, chatListSenderPrefix } from './ChatListMessagePreview';

interface UserChatCardProps {
  chat: UserChat;
  listPresenceBatched?: boolean;
  unreadCount?: number;
  onClick?: () => void;
  onMouseEnter?: () => void;
  isSelected?: boolean;
  draft?: ChatDraft | null;
  listOutbox?: ChatListOutbox | null;
  onOutboxRetry?: () => void;
  onOutboxDismiss?: () => void;
  isPinned?: boolean;
  onPinToggle?: () => void;
  canPin?: boolean;
  isPinning?: boolean;
  isMuted?: boolean;
  onMuteToggle?: () => void;
  isTogglingMute?: boolean;
}

const UserChatCardInner = ({ chat, listPresenceBatched = false, unreadCount = 0, onClick, onMouseEnter, isSelected = false, draft, listOutbox, onOutboxRetry, onOutboxDismiss, isPinned = false, onPinToggle, canPin = true, isPinning = false, isMuted = false, onMuteToggle, isTogglingMute = false }: UserChatCardProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const viewerLevelSport = useViewerLevelSport();
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);

  const otherUser = chat.user1Id === user?.id ? chat.user2 : chat.user1;
  const lastMessage = chat.lastMessage;
  const lastMessageTime = getLastMessageTime(lastMessage);
  const draftTime = draft ? new Date(draft.updatedAt).getTime() : 0;
  const showDraft = !!draft && (draftTime > lastMessageTime || !lastMessage);
  const gameLink = useChatListGameLinkPreview(showDraft ? null : chatListLastMessageText(lastMessage));

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      navigate(`/user-chat/${chat.id}`, { state: { chat } });
    }
  };

  const timeLabel =
    lastMessage || draft
      ? formatChatTime(
          draftTime > lastMessageTime && draft
            ? draft.updatedAt
            : lastMessage
              ? isLastMessagePreview(lastMessage)
                ? lastMessage.updatedAt
                : (lastMessage as { createdAt: string }).createdAt
              : new Date().toISOString(),
          displaySettings.locale,
          displaySettings.hour12
        )
      : null;

  const prefix = lastMessage && !showDraft ? chatListSenderPrefix(lastMessage, user?.id, t, { showOthers: false }) : null;

  return (
    <div
      onClick={handleClick}
      onMouseEnter={onMouseEnter}
      data-chat-selected={isSelected ? 'true' : undefined}
      className={`chat-list-row group flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${isSelected
        ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
        : 'hover:bg-gray-100 dark:hover:bg-gray-800/70'
        }`}
    >
      <div className="flex-shrink-0 self-start">
        <PlayerAvatar
          player={otherUser}
          subscribePresence={!listPresenceBatched}
          smallLayout
          showName={false}
          fullHideName={true}
          levelSport={viewerLevelSport}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-gray-900 dark:text-white">
            <PremiumName user={otherUser}>{[otherUser.firstName, otherUser.lastName].filter(Boolean).join(' ') || 'Unknown'}</PremiumName>
          </h3>
          <ChatListRowActions
            isPinned={isPinned}
            onPinToggle={onPinToggle}
            canPin={canPin}
            isPinning={isPinning}
            isMuted={isMuted}
            onMuteToggle={onMuteToggle}
            isTogglingMute={isTogglingMute}
          />
          {timeLabel ? (
            <span
              className={`shrink-0 whitespace-nowrap text-xs tabular-nums ${
                unreadCount > 0 && !isMuted ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {timeLabel}
            </span>
          ) : null}
        </div>
        {otherUser.verbalStatus && <p className="verbal-status">{otherUser.verbalStatus}</p>}
        <ChatListOutboxAnimated
          listOutbox={listOutbox}
          onRetry={listOutbox?.state === 'failed' ? onOutboxRetry : undefined}
          onDismiss={listOutbox?.state === 'failed' ? onOutboxDismiss : undefined}
        />
        <div className="mt-0.5 flex items-center gap-2 min-w-0">
          <p ref={gameLink.ref} className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {showDraft ? (
              <ChatListDraftPreview content={draft?.content || ''} />
            ) : lastMessage ? (
              <>
                {prefix ? <span className="text-gray-900 dark:text-gray-200">{prefix}: </span> : null}
                {chatListPreviewBody(lastMessage, t, gameLink.game ? gameLink.link : null)}
              </>
            ) : (
              <span className="italic text-gray-400 dark:text-gray-500">{t('chat.noMessages')}</span>
            )}
          </p>
          <UnreadBadge count={unreadCount ?? 0} className="shrink-0" />
        </div>
        {gameLink.game && gameLink.link ? <ChatListGameLinkStrip link={gameLink.link} preview={gameLink.game} /> : null}
      </div>
    </div>
  );
};

export const UserChatCard = memo(UserChatCardInner);
