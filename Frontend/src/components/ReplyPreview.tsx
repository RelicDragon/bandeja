import React from 'react';
import { useTranslation } from 'react-i18next';
import { Reply } from 'lucide-react';
import { ChatMessage } from '@/api/chat';
import { convertMentionsToPlaintext } from '@/utils/parseMentions';

const REPLY_TRUNCATE_LEN = 100;

type ReplyToType = ChatMessage['replyTo'];

interface ReplyPreviewProps {
  replyTo: ReplyToType;
  onCancel?: () => void;
  onScrollToMessage?: (messageId: string) => void;
  className?: string;
}

function truncate(str: string, max: number): string {
  const t = str.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim() + '…';
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
      return `${replyTo.sender.firstName || ''} ${replyTo.sender.lastName || ''}`.trim();
    }
    return replyTo.sender.firstName || 'Unknown';
  };

  const handleClick = () => {
    if (onScrollToMessage && replyTo.id) {
      onScrollToMessage(replyTo.id);
    }
  };

  const raw = convertMentionsToPlaintext(replyTo.content || '');
  const displayContent = truncate(raw, REPLY_TRUNCATE_LEN);

  return (
    <div className={`bg-gray-50 dark:bg-gray-700 border-l-4 border-green-500 p-2 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 flex flex-col" onClick={handleClick}>
          <div className="text-xs text-green-600 dark:text-green-400 font-medium flex-shrink-0 flex items-center gap-1">
            <Reply className="w-3.5 h-3.5 flex-shrink-0 scale-x-[-1]" />
            {getSenderName()}:
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-100 break-words whitespace-pre-wrap min-w-0 mt-0.5 line-clamp-2">
            {displayContent}
          </div>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full transition-colors flex-shrink-0"
            title={t('chat.reply.cancelReply')}
          >
            <span className="text-gray-500 dark:text-gray-400 text-sm">✕</span>
          </button>
        )}
      </div>
    </div>
  );
};
