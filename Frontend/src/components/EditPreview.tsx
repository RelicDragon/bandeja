import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChatMessage } from '@/api/chat';
import { convertMentionsToPlaintext } from '@/utils/parseMentions';
import { Pencil } from 'lucide-react';

interface EditPreviewProps {
  message: ChatMessage;
  onCancel: () => void;
  className?: string;
}

export const EditPreview: React.FC<EditPreviewProps> = ({
  message,
  onCancel,
  className = '',
}) => {
  const { t } = useTranslation();
  const displayContent = convertMentionsToPlaintext(message.content || '');
  const truncated = displayContent.length > 120 ? `${displayContent.slice(0, 120)}…` : displayContent;

  return (
    <div className={`bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 dark:border-amber-500 p-2 rounded-lg flex items-start justify-between gap-2 ${className}`}>
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <Pencil size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-amber-700 dark:text-amber-300 font-medium">
            {t('chat.editingLabel', { defaultValue: 'Editing' })}:
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-200 break-words whitespace-pre-wrap truncate">
            {truncated || t('chat.noContent', { defaultValue: '(no text)' })}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="p-1 hover:bg-amber-200/50 dark:hover:bg-amber-800/30 rounded-full transition-colors flex-shrink-0"
        title={t('chat.cancelEdit', { defaultValue: 'Cancel edit' })}
      >
        <span className="text-amber-700 dark:text-amber-300 text-sm">✕</span>
      </button>
    </div>
  );
};
