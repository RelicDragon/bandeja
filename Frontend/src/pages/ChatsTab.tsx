import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChatList } from '@/components/chat/ChatList';
import { GameChat } from './GameChat';
import { MessageCircle } from 'lucide-react';
import { useNavigationStore } from '@/store/navigationStore';
import { BugsTab } from './BugsTab';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { BottomTabBar } from '@/components/navigation/BottomTabBar';

export const ChatsTab = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedChatType, setSelectedChatType] = useState<'user' | 'bug' | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { setIsAnimating, chatsFilter, bottomTabsVisible } = useNavigationStore();

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleChatSelect = useCallback((chatId: string, chatType: 'user' | 'bug') => {
    if (isDesktop) {
      if (selectedChatId === chatId && selectedChatType === chatType) {
        return;
      }
      setIsTransitioning(true);
      requestAnimationFrame(() => {
        setSelectedChatId(chatId);
        setSelectedChatType(chatType);
        setTimeout(() => setIsTransitioning(false), 150);
      });
    } else {
      setIsAnimating(true);
      if (chatType === 'user') {
        navigate(`/user-chat/${chatId}`);
      } else if (chatType === 'bug') {
        navigate(`/bugs/${chatId}/chat`);
      }
      setTimeout(() => setIsAnimating(false), 300);
    }
  }, [isDesktop, selectedChatId, selectedChatType, setIsAnimating, navigate]);

  if (chatsFilter === 'bugs') {
    return <BugsTab />;
  }

  if (isDesktop) {
    return (
      <div className="fixed inset-0 top-[calc(4rem+env(safe-area-inset-top))] overflow-hidden">
        <ResizableSplitter
          defaultLeftWidth={40}
          minLeftWidth={250}
          maxLeftWidth={600}
          leftPanel={
            <div className="h-full border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col relative">
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <ChatList onChatSelect={handleChatSelect} isDesktop={true} selectedChatId={selectedChatId} selectedChatType={selectedChatType} />
              </div>
              {bottomTabsVisible && (
                <div className="absolute bottom-0 left-0 right-0 flex justify-center">
                  <BottomTabBar containerPosition={true} />
                </div>
              )}
            </div>
          }
          rightPanel={
            <div className="h-full bg-gray-50 dark:bg-gray-900 relative">
              {selectedChatId && selectedChatType ? (
                <div className={`absolute inset-0 transition-opacity duration-150 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
                  <GameChat
                    key={`${selectedChatType}-${selectedChatId}`}
                    isEmbedded={true}
                    chatId={selectedChatId}
                    chatType={selectedChatType}
                  />
                </div>
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
