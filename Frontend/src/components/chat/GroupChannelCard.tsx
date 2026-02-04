import { formatChatTime } from '@/utils/dateFormat';
import { GroupChannel, ChatDraft, getLastMessageTime, getLastMessageText, isLastMessagePreview } from '@/api/chat';
import { Users, Hash } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface GroupChannelCardProps {
  groupChannel: GroupChannel;
  unreadCount?: number;
  onClick: () => void;
  isSelected?: boolean;
  draft?: ChatDraft | null;
}

export const GroupChannelCard = ({ groupChannel, unreadCount = 0, onClick, isSelected, draft }: GroupChannelCardProps) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const displayName = groupChannel.name;
  const lastMessage = groupChannel.lastMessage;

  const lastMessageTime = getLastMessageTime(lastMessage);
  const draftTime = draft ? new Date(draft.updatedAt).getTime() : 0;
  const showDraft = draft && (draftTime > lastMessageTime || !lastMessage);

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 p-3 cursor-pointer transition-colors border-b border-gray-200 dark:border-gray-700 ${
        isSelected 
          ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30' 
          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      <div className="relative flex-shrink-0">
        {groupChannel.avatar ? (
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
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
              {displayName}
            </h3>
            {groupChannel.isChannel && (
              <span className="text-xs text-gray-500 dark:text-gray-400">Channel</span>
            )}
          </div>
          {(lastMessage || draft) && (
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">
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
        </div>

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
                  <span className="flex-shrink-0 bg-blue-500 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 font-medium">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
            );
          }

          if (lastMessage) {
            const displayText = getLastMessageText(lastMessage);
            const isPreviewOnly = isLastMessagePreview(lastMessage);
            const fullMsg = !isPreviewOnly && lastMessage && 'mediaUrls' in lastMessage ? lastMessage as { mediaUrls?: string[] } : null;
            const hasMedia = (fullMsg?.mediaUrls?.length ?? 0) > 0;
            const sender =
              !isPreviewOnly && lastMessage && 'sender' in lastMessage
                ? (lastMessage as { sender?: { firstName?: string; lastName?: string } }).sender ?? null
                : null;

            return (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 pr-2">
                  {hasMedia ? (
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {t('chat.photo')}
                    </span>
                  ) : (
                    <>
                      {sender && (
                        <span className="font-medium">
                          {sender.firstName} {sender.lastName}:{' '}
                        </span>
                      )}
                      {displayText || 'No message'}
                    </>
                  )}
                </p>
                {unreadCount > 0 && (
                  <span className="flex-shrink-0 bg-blue-500 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 font-medium">
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
