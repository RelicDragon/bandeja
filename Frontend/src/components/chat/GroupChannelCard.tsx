import { formatChatTime } from '@/utils/dateFormat';
import {
  ChatMessage,
  GroupChannel,
  ChatDraft,
  getLastMessageTime,
  isLastMessagePreview,
  type LastMessagePreview,
} from '@/api/chat';
import { Users, Hash, Package, Pin, Loader2, BellOff, Home, Mic } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { BugPriorityBadge } from '@/components/chat/BugPriorityBadge';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { convertMentionsToPlaintext } from '@/utils/parseMentions';
import { formatSystemMessageForDisplay } from '@/utils/systemMessages';
import { formatVoiceDurationMmSs } from '@/utils/messagePreview';
import { ChatListGenericMediaRow, ChatListPreviewContent } from '@/components/chat/ChatListPreviewContent';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { ChatListOutboxAnimated } from '@/components/chat/ChatListOutboxAnimated';
import type { ChatListOutbox } from '@/utils/chatListSort';

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
  const { user } = useAuthStore();
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
  const showDraft = draft && (draftTime > lastMessageTime || !lastMessage);

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 p-3 cursor-pointer transition-colors border-b border-gray-200 dark:border-gray-700 ${isSelected
        ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
    >
      {!groupChannel.bugId && (
        <div className="relative flex-shrink-0">
          {groupChannel.marketItem && sellerGroupedByItem && groupChannel.buyer ? (
            <PlayerAvatar player={groupChannel.buyer} subscribePresence={!listPresenceBatched} extrasmall fullHideName showName={false} asDiv />
          ) : groupChannel.marketItem ? (
            groupChannel.marketItem.mediaUrls?.length ? (
              <img
                src={groupChannel.marketItem.mediaUrls[0]}
                alt={displayName}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <Package className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
            )
          ) : groupChannel.avatar ? (
            <img
              src={groupChannel.avatar}
              alt={displayName}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              {groupChannel.isChannel ? (
                <Hash className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              ) : (
                <Users className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {groupChannel.bug ? (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                {(groupChannel.bug.priority ?? 0) !== 0 && (
                  <BugPriorityBadge priority={groupChannel.bug.priority ?? 0} />
                )}
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide bg-amber-100/80 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                  {t(`bug.types.${groupChannel.bug.bugType}`)}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
                  {t(`bug.statuses.${groupChannel.bug.status}`)}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                {(lastMessage || draft) && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatChatTime(
                      draftTime > lastMessageTime && draft ? draft.updatedAt : lastMessage
                        ? isLastMessagePreview(lastMessage)
                          ? lastMessage.updatedAt
                          : (lastMessage as { createdAt: string }).createdAt
                        : new Date().toISOString(),
                      displaySettings.locale,
                      displaySettings.hour12
                    )}
                  </span>
                )}
                {onMuteToggle != null && (isMuted || isTogglingMute) && (
                  <button
                    type="button"
                    onClick={onMuteToggle}
                    disabled={isTogglingMute}
                    className={`p-1 rounded disabled:opacity-50 disabled:pointer-events-none transition-colors ${isMuted ? 'text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    aria-label={isMuted ? t('chat.unmute', { defaultValue: 'Unmute chat' }) : t('chat.mute', { defaultValue: 'Mute chat' })}
                    aria-busy={isTogglingMute}
                  >
                    {isTogglingMute ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                    ) : (
                      <BellOff className="w-4 h-4" aria-hidden />
                    )}
                  </button>
                )}
                {onPinToggle != null && (
                  <button
                    type="button"
                    onClick={onPinToggle}
                    disabled={isPinned ? isPinning : !canPin || isPinning}
                    className={`p-1 rounded disabled:opacity-50 disabled:pointer-events-none ${isPinned ? 'text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                    aria-label={isPinned ? t('chat.unpinChat') : t('chat.pinChat')}
                    aria-busy={isPinning}
                  >
                    {isPinning ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                    ) : (
                      <Pin className={`w-4 h-4 ${isPinned ? 'rotate-[-90deg] fill-current' : ''}`} aria-hidden />
                    )}
                  </button>
                )}
              </div>
            </div>
            <h3 className="text-sm text-gray-900 dark:text-white break-words min-w-0 mb-1">
              {displayName}
            </h3>
            {groupChannel.bug.sender && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <PlayerAvatar player={groupChannel.bug.sender} subscribePresence={!listPresenceBatched} extrasmall fullHideName showName={false} asDiv />
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {groupChannel.bug.sender.firstName} {groupChannel.bug.sender.lastName}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-start justify-between mb-1 gap-2">
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="min-w-0 flex flex-col gap-0.5">
                  <h3 className="text-sm text-gray-900 dark:text-white break-words min-w-0">
                    {groupChannel.isCityGroup ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200 px-2.5 py-0.5 text-xs font-medium shadow-sm ring-1 ring-primary-200/60 dark:ring-primary-700/50 w-fit">
                        <Home className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                        {displayName}
                      </span>
                    ) : (
                      displayName
                    )}
                  </h3>
                  {displaySubtitle && (
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate leading-tight">
                      {displaySubtitle}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              {(lastMessage || draft) && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatChatTime(
                    (() => {
                      const msg = lastMessage;
                      return draftTime > lastMessageTime && draft
                        ? draft.updatedAt
                        : msg
                          ? isLastMessagePreview(msg)
                            ? msg.updatedAt
                            : (msg as { createdAt: string }).createdAt
                          : new Date().toISOString();
                    })(),
                    displaySettings.locale,
                    displaySettings.hour12
                  )}
                </span>
              )}
              {onMuteToggle != null && (isMuted || isTogglingMute) && (
                <button
                  type="button"
                  onClick={onMuteToggle}
                  disabled={isTogglingMute}
                  className={`p-1 rounded disabled:opacity-50 disabled:pointer-events-none transition-colors ${isMuted ? 'text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                  aria-label={isMuted ? t('chat.unmute', { defaultValue: 'Unmute chat' }) : t('chat.mute', { defaultValue: 'Mute chat' })}
                  aria-busy={isTogglingMute}
                >
                  {isTogglingMute ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  ) : (
                    <BellOff className="w-4 h-4" aria-hidden />
                  )}
                </button>
              )}
              {onPinToggle != null && (
                <button
                  type="button"
                  onClick={onPinToggle}
                  disabled={isPinned ? isPinning : !canPin || isPinning}
                  className={`p-1 rounded disabled:opacity-50 disabled:pointer-events-none ${isPinned ? 'text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                  aria-label={isPinned ? t('chat.unpinChat') : t('chat.pinChat')}
                  aria-busy={isPinning}
                >
                  {isPinning ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  ) : (
                    <Pin className={`w-4 h-4 ${isPinned ? 'rotate-[-90deg] fill-current' : ''}`} aria-hidden />
                  )}
                </button>
              )}
            </div>
          </div>
        )}
        <ChatListOutboxAnimated
          listOutbox={listOutbox}
          onRetry={listOutbox?.state === 'failed' ? onOutboxRetry : undefined}
          onDismiss={listOutbox?.state === 'failed' ? onOutboxDismiss : undefined}
        />
        {(() => {
          if (showDraft) {
            const draftContent = draft?.content || '';
            const displayContent = draftContent.trim()
              ? (draftContent.length > 50 ? draftContent.substring(0, 50) + '...' : draftContent)
              : '';
            return (
              <div className="flex items-center justify-between">
                <p className="text-sm line-clamp-2 pr-2">
                  <span className="text-red-500 dark:text-red-400">Draft:</span>
                  {displayContent && (
                    <span className="text-gray-500 dark:text-gray-400 italic ml-1">{displayContent}</span>
                  )}
                </p>
                {unreadCount > 0 && (
                  <span className="flex-shrink-0 bg-red-500 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 font-medium">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
            );
          }

          if (lastMessage) {
            const isPreviewOnly = isLastMessagePreview(lastMessage);
            const fullMsg =
              !isPreviewOnly && lastMessage && 'mediaUrls' in lastMessage
                ? (lastMessage as ChatMessage)
                : null;
            const displayText =
              fullMsg != null
                ? fullMsg.senderId
                  ? convertMentionsToPlaintext(fullMsg.content || '')
                  : convertMentionsToPlaintext(
                      formatSystemMessageForDisplay(fullMsg.content || '', t)
                    )
                : '';
            const isFullVoice = fullMsg?.messageType === 'VOICE';
            const voiceAsTextOnly = isFullVoice && !!(fullMsg?.content?.trim());
            const showVoiceRow = isFullVoice && !voiceAsTextOnly;
            const hasMediaUrls = (fullMsg?.mediaUrls?.length ?? 0) > 0;
            const mt = fullMsg?.messageType;
            const showGenericMediaRow =
              !isPreviewOnly && !isFullVoice && hasMediaUrls && mt === undefined;
            const showPhotoRow =
              !isPreviewOnly && !isFullVoice && hasMediaUrls && mt !== undefined;
            const previewLm = isPreviewOnly ? (lastMessage as LastMessagePreview) : null;
            const sender =
              fullMsg?.sender ?? (previewLm?.sender != null ? previewLm.sender : null);
            const senderIdForRow =
              fullMsg?.senderId ?? (previewLm?.senderId != null ? previewLm.senderId : null);
            const showGroupLastSender =
              !groupChannel.isChannel && senderIdForRow != null;
            const lastFromSelf = !!(user && senderIdForRow === user.id);
            const showGroupSenderRow =
              showGroupLastSender && (lastFromSelf || sender != null);

            return (
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0 pr-2 flex-1">
                  {showGroupSenderRow && (
                    <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
                      {lastFromSelf ? (
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium shrink-0">
                          {t('chat.you')}
                        </span>
                      ) : (
                        sender && (
                          <>
                            <PlayerAvatar player={sender} subscribePresence={!listPresenceBatched} superTiny fullHideName showName={false} asDiv />
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium truncate min-w-0">
                              {sender.firstName} {sender.lastName}
                            </span>
                          </>
                        )
                      )}
                    </div>
                  )}
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {showVoiceRow ? (
                      <>
                        {groupChannel.isChannel && sender && (
                          <span className="font-medium">
                            {sender.firstName} {sender.lastName}:{' '}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Mic className="w-4 h-4 shrink-0" aria-hidden />
                          <span>
                            {t('chat.voiceMessage', { defaultValue: 'Voice message' })}
                            {fullMsg?.audioDurationMs != null && fullMsg.audioDurationMs > 0
                              ? ` (${formatVoiceDurationMmSs(fullMsg.audioDurationMs)})`
                              : ''}
                          </span>
                        </span>
                      </>
                    ) : showPhotoRow ? (
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {t('chat.photo')}
                      </span>
                    ) : showGenericMediaRow ? (
                      <ChatListGenericMediaRow t={t} />
                    ) : isPreviewOnly ? (
                      lastMessage.preview?.trim() ? (
                        <ChatListPreviewContent preview={lastMessage.preview} t={t} />
                      ) : (
                        t('chat.noMessage')
                      )
                    ) : (
                      <>
                        {groupChannel.isChannel && sender && (
                          <span className="font-medium">
                            {sender.firstName} {sender.lastName}:{' '}
                          </span>
                        )}
                        {displayText || 'No message'}
                      </>
                    )}
                  </p>
                </div>
                {unreadCount > 0 && (
                  <span className="flex-shrink-0 bg-red-500 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 font-medium">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
            );
          }

          return (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">
              No messages yet
            </p>
          );
        })()}
      </div>
    </div>
  );
};

export const GroupChannelCard = memo(GroupChannelCardInner);
