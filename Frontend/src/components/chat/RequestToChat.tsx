import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';

interface RequestToChatProps {
  userChatId: string;
  onRequestSent?: () => void;
  onUserChatUpdate?: (userChat: { user1allowed?: boolean; user2allowed?: boolean }) => void;
  disabled?: boolean;
}

export const RequestToChat: React.FC<RequestToChatProps> = ({
  userChatId,
  onRequestSent,
  onUserChatUpdate,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const handleRequest = async () => {
    if (disabled || isLoading) return;
    setIsLoading(true);
    try {
      const { chatApi } = await import('@/api/chat');
      await chatApi.requestToChat(userChatId);
      onRequestSent?.();
      onUserChatUpdate?.({});
    } catch (err) {
      console.error('Request to chat failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="px-4 py-3" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
      <div className="rounded-[20px] px-4 py-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          {t('chat.userDoesNotAllowDirectChat')}
        </p>
        <button
          onClick={handleRequest}
          disabled={disabled || isLoading}
          className="w-full px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <MessageCircle size={18} />
          )}
          {t('chat.requestToChat')}
        </button>
      </div>
    </div>
  );
};
