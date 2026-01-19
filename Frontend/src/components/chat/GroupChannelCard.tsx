import { formatRelativeTime } from '@/utils/dateFormat';
import { GroupChannel, ChatDraft } from '@/api/chat';
import { Users, Hash } from 'lucide-react';

interface GroupChannelCardProps {
  groupChannel: GroupChannel;
  unreadCount?: number;
  onClick: () => void;
  isSelected?: boolean;
  draft?: ChatDraft | null;
}

export const GroupChannelCard = ({ groupChannel, unreadCount = 0, onClick, isSelected, draft }: GroupChannelCardProps) => {
  const displayName = groupChannel.name;
  const lastMessage = groupChannel.lastMessage;
  
  const lastMessageTime = lastMessage ? new Date(lastMessage.createdAt).getTime() : 0;
  const draftTime = draft ? new Date(draft.updatedAt).getTime() : 0;
  const showDraft = draft && (draftTime > lastMessageTime || !lastMessage);
  
  const lastMessageText = showDraft
    ? (draft?.content ? (draft.content.length > 50 ? draft.content.substring(0, 50) + '...' : draft.content) : '')
    : (lastMessage?.content 
        ? (lastMessage.content.length > 50 ? lastMessage.content.substring(0, 50) + '...' : lastMessage.content)
        : '');

  return (
    <div
      onClick={onClick}
      className={`p-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0 cursor-pointer transition-colors ${
        isSelected 
          ? 'bg-blue-50 dark:bg-blue-900/20' 
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
    >
      <div className="flex items-center gap-3">
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
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 font-medium">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {displayName}
            </h3>
            {groupChannel.isChannel && (
              <span className="text-xs text-gray-500 dark:text-gray-400">Channel</span>
            )}
          </div>
          
          {showDraft ? (
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-500 dark:text-gray-400 italic truncate flex-1">
                {lastMessageText.trim() ? `Draft: ${lastMessageText}` : 'Draft:'}
              </p>
              <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                {formatRelativeTime(draft!.updatedAt)}
              </span>
            </div>
          ) : lastMessage ? (
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-600 dark:text-gray-400 truncate flex-1">
                {lastMessage.sender && (
                  <span className="font-medium">
                    {lastMessage.sender.firstName} {lastMessage.sender.lastName}:{' '}
                  </span>
                )}
                {lastMessageText}
              </p>
              <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                {formatRelativeTime(lastMessage.createdAt)}
              </span>
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No messages yet
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
