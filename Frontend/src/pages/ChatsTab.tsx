import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChatList } from '@/components/chat/ChatList';
import { GameChat } from './GameChat';
import { MessageCircle } from 'lucide-react';
import { useNavigationStore } from '@/store/navigationStore';
import { BugsTab } from './BugsTab';
import { ResizableSplitter } from '@/components/ResizableSplitter';

export const ChatsTab = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedChatType, setSelectedChatType] = useState<'user' | 'bug' | null>(null);
  const { setIsAnimating, chatsFilter } = useNavigationStore();

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleChatSelect = (chatId: string, chatType: 'user' | 'bug') => {
    if (isDesktop) {
      setSelectedChatId(chatId);
      setSelectedChatType(chatType);
    } else {
      setIsAnimating(true);
      if (chatType === 'user') {
        navigate(`/user-chat/${chatId}`);
      } else if (chatType === 'bug') {
        navigate(`/bugs/${chatId}/chat`);
      }
      setTimeout(() => setIsAnimating(false), 300);
    }
  };

  if (chatsFilter === 'bugs') {
    return <BugsTab />;
  }

  if (isDesktop) {
    return (
      <div className="h-[calc(100vh-9rem)] -mt-4 -mb-4 overflow-hidden">
        <ResizableSplitter
          defaultLeftWidth={40}
          minLeftWidth={250}
          maxLeftWidth={600}
          leftPanel={
            <div className="h-full border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col">
              <div className="flex-1 overflow-hidden">
                <ChatList onChatSelect={handleChatSelect} isDesktop={true} selectedChatId={selectedChatId} selectedChatType={selectedChatType} />
              </div>
            </div>
          }
          rightPanel={
            <div className="h-full bg-gray-50 dark:bg-gray-900">
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
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ChatList onChatSelect={handleChatSelect} isDesktop={false} />
    </div>
  );
};
