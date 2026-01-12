import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChatList } from '@/components/chat/ChatList';
import { GameChat } from './GameChat';
import { MessageCircle } from 'lucide-react';
import { useNavigationStore } from '@/store/navigationStore';

export const ChatsTab = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedChatType, setSelectedChatType] = useState<'user' | 'bug' | 'game' | null>(null);
  const { setIsAnimating } = useNavigationStore();

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleChatSelect = (chatId: string, chatType: 'user' | 'bug' | 'game') => {
    if (isDesktop) {
      setSelectedChatId(chatId);
      setSelectedChatType(chatType);
    } else {
      setIsAnimating(true);
      if (chatType === 'user') {
        navigate(`/user-chat/${chatId}`);
      } else if (chatType === 'bug') {
        navigate(`/bugs/${chatId}/chat`);
      } else {
        navigate(`/games/${chatId}/chat`);
      }
      setTimeout(() => setIsAnimating(false), 300);
    }
  };

  if (isDesktop) {
    return (
      <div className="flex h-[calc(100vh-8rem)] -mx-2 -my-4">
        <div className="w-2/5 min-w-[350px] max-w-[500px] border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-4 z-10">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {t('chat.title', { defaultValue: 'Chats' })}
            </h1>
          </div>
          <div className="h-[calc(100%-73px)] overflow-hidden">
            <ChatList onChatSelect={handleChatSelect} isDesktop={true} />
          </div>
        </div>

        <div className="flex-1 bg-gray-50 dark:bg-gray-900">
          {selectedChatId && selectedChatType ? (
            <GameChat
              isEmbedded={true}
              chatId={selectedChatId}
              chatType={selectedChatType}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
              <MessageCircle size={80} className="mb-6 opacity-30" />
              <p className="text-xl font-medium mb-2">
                {t('chat.selectChat', { defaultValue: 'Select a chat to start messaging' })}
              </p>
              <p className="text-sm">
                {t('chat.selectChatHint', { defaultValue: 'Choose a conversation from the list' })}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('chat.title', { defaultValue: 'Chats' })}
      </h1>
      <ChatList onChatSelect={handleChatSelect} isDesktop={false} />
    </div>
  );
};
