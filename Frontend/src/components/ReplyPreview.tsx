import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChatMessage } from '@/api/chat';
import { BugMessage } from '@/api/bugChat';

type ReplyToType = ChatMessage['replyTo'] | BugMessage['replyTo'];

interface ReplyPreviewProps {
  replyTo: ReplyToType;
  onCancel?: () => void;
  onScrollToMessage?: (messageId: string) => void;
  className?: string;
}

export const ReplyPreview: React.FC<ReplyPreviewProps> = ({
  replyTo,
  onCancel,
  onScrollToMessage,
  className = '',
}) => {
  const { t } = useTranslation();

  if (!replyTo) return null;

  const getSenderName = () => {
    if (!replyTo.sender) return 'System';
    if (replyTo.sender.firstName && replyTo.sender.lastName) {
      return `${replyTo.sender.firstName} ${replyTo.sender.lastName}`;
    }
    return replyTo.sender.firstName || 'Unknown';
  };

  const handleClick = () => {
    if (onScrollToMessage && replyTo.id) {
      onScrollToMessage(replyTo.id);
    }
  };

  return (
    <div className={`bg-gray-50 dark:bg-gray-700 border-l-4 border-green-500 p-2 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0 flex items-center space-x-2" onClick={handleClick}>
          <div className="text-xs text-green-600 dark:text-green-400 font-medium flex-shrink-0">
            {getSenderName()}:
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-300 truncate min-w-0">
            {replyTo.content}
          </div>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="ml-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full transition-colors flex-shrink-0"
            title={t('chat.reply.cancelReply')}
          >
            <span className="text-gray-500 dark:text-gray-400 text-sm">✕</span>
          </button>
        )}
      </div>
    </div>
  );
};
