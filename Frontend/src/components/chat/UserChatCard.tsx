import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { formatChatTime } from '@/utils/dateFormat';
import { UserChat, ChatDraft, getLastMessageTime, isLastMessagePreview } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { useMemo } from 'react';
import { convertMentionsToPlaintext } from '@/utils/parseMentions';
import { formatSystemMessageForDisplay } from '@/utils/systemMessages';
import { parseMessagePreview } from '@/utils/messagePreview';

interface UserChatCardProps {
  chat: UserChat;
  unreadCount?: number;
  onClick?: () => void;
  isSelected?: boolean;
  draft?: ChatDraft | null;
}

export const UserChatCard = ({ chat, unreadCount = 0, onClick, isSelected = false, draft }: UserChatCardProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);

  const otherUser = chat.user1Id === user?.id ? chat.user2 : chat.user1;

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      navigate(`/user-chat/${chat.id}`);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`flex items-center gap-3 p-3 cursor-pointer transition-colors border-b border-gray-200 dark:border-gray-700 ${isSelected
        ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
    >
      <div className="flex-shrink-0">
        <PlayerAvatar
          player={otherUser}
          smallLayout
          showName={false}
          fullHideName={true}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
            {[otherUser.firstName, otherUser.lastName].filter(Boolean).join(' ') || 'Unknown'}
          </h3>
          {(chat.lastMessage || draft) && (
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">
              {formatChatTime(
                (() => {
                  const lastMessageTime = getLastMessageTime(chat.lastMessage);
                  const draftTime = draft ? new Date(draft.updatedAt).getTime() : 0;
                  const msg = chat.lastMessage;
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
        </div>

        {(() => {
          const lastMessageTime = getLastMessageTime(chat.lastMessage);
          const draftTime = draft ? new Date(draft.updatedAt).getTime() : 0;
          const showDraft = draft && (draftTime > lastMessageTime || !chat.lastMessage);

          if (showDraft) {
            const draftContent = draft.content || '';
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

          if (chat.lastMessage) {
            const fullMessage = !isLastMessagePreview(chat.lastMessage) ? chat.lastMessage : null;
            const displayContent = isLastMessagePreview(chat.lastMessage)
              ? parseMessagePreview(chat.lastMessage.preview, t)
              : fullMessage
                ? fullMessage.senderId
                  ? convertMentionsToPlaintext(fullMessage.content || '')
                  : convertMentionsToPlaintext(
                    formatSystemMessageForDisplay(fullMessage.content || '', t)
                  )
                : '';

            return (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 pr-2">
                  {!isLastMessagePreview(chat.lastMessage) &&
                    chat.lastMessage.mediaUrls?.length > 0 ? (
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {t('chat.photo')}
                    </span>
                  ) : (
                    displayContent || t('chat.noMessage')
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

          return (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">
              {t('chat.noMessages')}
            </p>
          );
        })()}
      </div>
    </div>
  );
};
