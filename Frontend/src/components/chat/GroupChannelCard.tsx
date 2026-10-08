import { formatChatTime } from '@/utils/dateFormat';
import { GroupChannel, ChatDraft, getLastMessageTime, isLastMessagePreview } from '@/api/chat';
import { Users, Hash, Package, Home } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { UnreadBadge } from '@/components/UnreadBadge';
import { BugPriorityBadge } from '@/components/chat/BugPriorityBadge';
import { BugStarRating } from '@/components/bugs/BugStarRating';
import { isReviewBugType, isValidReviewStars } from '@/components/bugs/reviewStars';
import { useAuthStore } from '@/store/authStore';
import { useViewerLevelSport } from '@/hooks/useViewerLevelSport';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { ChatListOutboxAnimated } from '@/components/chat/ChatListOutboxAnimated';
import type { ChatListOutbox } from '@/utils/chatListSort';
import { ChatListRowActions } from './ChatListRowActions';
import { ChatListDraftPreview } from './ChatListDraftPreview';
import { ChatListGameLinkStrip } from './ChatListGameLinkStrip';
import { useChatListGameLinkPreview } from './useChatListGameLinkPreview';
import { chatListLastMessageText, chatListPreviewBody, chatListSenderPrefix } from './ChatListMessagePreview';

interface GroupChannelCardProps {
  groupChannel: GroupChannel;
  listPresenceBatched?: boolean;
  unreadCount?: number;
  onClick: () => void;
  isSelected?: boolean;
  draft?: ChatDraft | null;
  listOutbox?: ChatListOutbox | null;
  onOutboxRetry?: () => void;
  onOutboxDismiss?: () => void;
  displayTitle?: string;
  displaySubtitle?: string;
  sellerGroupedByItem?: boolean;
  isPinned?: boolean;
  onPinToggle?: () => void;
  canPin?: boolean;
  isPinning?: boolean;
  isMuted?: boolean;
  onMuteToggle?: () => void;
  isTogglingMute?: boolean;
}

const GroupChannelCardInner = ({ groupChannel, listPresenceBatched = false, unreadCount = 0, onClick, isSelected, draft, listOutbox, onOutboxRetry, onOutboxDismiss, displayTitle, displaySubtitle, sellerGroupedByItem, isPinned = false, onPinToggle, canPin = true, isPinning = false, isMuted = false, onMuteToggle, isTogglingMute = false }: GroupChannelCardProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const viewerLevelSport = useViewerLevelSport();
  const { translateCity } = useTranslatedGeo();
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const displayName = useMemo(() => {
    if (groupChannel.isCityGroup) {
      return translateCity(groupChannel.id, groupChannel.name, '');
    }
    return displayTitle ?? groupChannel.name;
  }, [groupChannel.isCityGroup, groupChannel.id, groupChannel.name, displayTitle, translateCity]);
  const lastMessage = groupChannel.lastMessage;

  const lastMessageTime = getLastMessageTime(lastMessage);
  const draftTime = draft ? new Date(draft.updatedAt).getTime() : 0;
  const showDraft = !!draft && (draftTime > lastMessageTime || !lastMessage);
  const gameLink = useChatListGameLinkPreview(showDraft ? null : chatListLastMessageText(lastMessage));

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

  const rowActions = (
    <ChatListRowActions
      isPinned={isPinned}
      onPinToggle={onPinToggle}
      canPin={canPin}
      isPinning={isPinning}
      isMuted={isMuted}
      onMuteToggle={onMuteToggle}
      isTogglingMute={isTogglingMute}
    />
  );

  const time = timeLabel ? (
    <span
      className={`shrink-0 whitespace-nowrap text-xs tabular-nums ${
        unreadCount > 0 && !isMuted ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'
      }`}
    >
      {timeLabel}
    </span>
  ) : null;

  const avatarBox = 'w-12 h-12 rounded-full';

  return (
    <div
      onClick={onClick}
      data-chat-selected={isSelected ? 'true' : undefined}
      className={`chat-list-row group flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${isSelected
        ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
        : 'hover:bg-gray-100 dark:hover:bg-gray-800/70'
        }`}
    >
      {!groupChannel.bugId && (
        <div className="relative flex-shrink-0 self-start">
          {groupChannel.marketItem && sellerGroupedByItem && groupChannel.buyer ? (
            <PlayerAvatar player={groupChannel.buyer} subscribePresence={!listPresenceBatched} extrasmall fullHideName showName={false} asDiv levelSport={viewerLevelSport} />
          ) : groupChannel.marketItem ? (
            groupChannel.marketItem.mediaUrls?.length ? (
              <img src={groupChannel.marketItem.mediaUrls[0]} alt={displayName} className={`${avatarBox} object-cover`} />
            ) : (
              <div className={`${avatarBox} bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center`}>
                <Package className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
            )
          ) : groupChannel.avatar ? (
            <img src={groupChannel.avatar} alt={displayName} className={`${avatarBox} object-cover`} />
          ) : (
            <div className={`${avatarBox} bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center`}>
              {groupChannel.isChannel ? (
                <Hash className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              ) : (
                <Users className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              )}
            </div>
          )}
          {groupChannel.isCityGroup ? (
            <span
              className="absolute -bottom-0.5 -end-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm"
              title={t('chat.list.cityChat', { defaultValue: 'City chat' })}
            >
              <Home className="h-3 w-3" aria-hidden />
            </span>
          ) : null}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {groupChannel.bug ? (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                {isReviewBugType(groupChannel.bug.bugType) ? (
                  <BugStarRating
                    value={isValidReviewStars(groupChannel.bug.priority ?? 0) ? groupChannel.bug.priority ?? 0 : null}
                    readonly
                    size="sm"
                    showLabel={false}
                  />
                ) : (
                  (groupChannel.bug.priority ?? 0) !== 0 && (
                    <BugPriorityBadge priority={groupChannel.bug.priority ?? 0} />
                  )
                )}
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide bg-amber-100/80 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                  {t(`bug.types.${groupChannel.bug.bugType}`)}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
                  {t(`bug.statuses.${groupChannel.bug.status}`)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {rowActions}
                {time}
              </div>
            </div>
            <h3 className="text-sm text-gray-900 dark:text-white break-words min-w-0 mb-1">
              {displayName}
            </h3>
            {groupChannel.bug.sender && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <PlayerAvatar player={groupChannel.bug.sender} subscribePresence={!listPresenceBatched} extrasmall fullHideName showName={false} asDiv levelSport={viewerLevelSport} />
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {groupChannel.bug.sender.firstName} {groupChannel.bug.sender.lastName}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-gray-900 dark:text-white">
                {displayName}
              </h3>
              {rowActions}
              {time}
            </div>
            {displaySubtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate leading-tight">{displaySubtitle}</p>
            )}
          </>
        )}
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
                {(() => {
                  const prefix = chatListSenderPrefix(lastMessage, user?.id, t, { showOthers: true });
                  return prefix ? <span className="text-gray-900 dark:text-gray-200">{prefix}: </span> : null;
                })()}
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

export const GroupChannelCard = memo(GroupChannelCardInner);
