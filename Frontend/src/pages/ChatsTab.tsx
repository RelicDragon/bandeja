import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
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
  const location = useLocation();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedChatType, setSelectedChatType] = useState<'user' | 'bug' | 'group' | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { setIsAnimating, chatsFilter, bottomTabsVisible } = useNavigationStore();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const selectedChatIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout;
    
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const newIsDesktop = window.innerWidth >= 768;
        setIsDesktop(newIsDesktop);
        
        if (!newIsDesktop && selectedChatIdRef.current) {
          setSelectedChatId(null);
          setSelectedChatType(null);
        }
      }, 150);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    
    const path = location.pathname;
    const currentSelectedChatId = selectedChatIdRef.current;
    
    if (path.includes('/user-chat/')) {
      const chatId = path.split('/user-chat/')[1]?.split('/')[0];
      if (chatId && chatId !== currentSelectedChatId) {
        setSelectedChatId(chatId);
        setSelectedChatType('user');
      }
    } else if (path.includes('/bugs/') && path.includes('/chat')) {
      const match = path.match(/\/bugs\/([^/]+)\/chat/);
      if (match && match[1] && match[1] !== currentSelectedChatId) {
        setSelectedChatId(match[1]);
        setSelectedChatType('bug');
      }
    } else if (path.includes('/group-chat/')) {
      const chatId = path.split('/group-chat/')[1]?.split('/')[0];
      if (chatId && chatId !== currentSelectedChatId) {
        setSelectedChatId(chatId);
        setSelectedChatType('group');
      }
    } else if (!path.includes('/user-chat/') && !path.includes('/bugs/') && !path.includes('/group-chat/')) {
      if (currentSelectedChatId !== null) {
        setSelectedChatId(null);
        setSelectedChatType(null);
      }
    }
  }, [location.pathname, isDesktop]);

  useEffect(() => {
    if (chatsFilter === 'bugs') {
      setSelectedChatId(null);
      setSelectedChatType(null);
    }
  }, [chatsFilter]);

  const getChatPath = useCallback((chatId: string, chatType: 'user' | 'bug' | 'group') => {
    return chatType === 'user' 
      ? `/user-chat/${chatId}`
      : chatType === 'bug'
      ? `/bugs/${chatId}/chat`
      : `/group-chat/${chatId}`;
  }, []);

  const handleChatSelect = useCallback((chatId: string, chatType: 'user' | 'bug' | 'group') => {
    if (isDesktop) {
      if (selectedChatId === chatId && selectedChatType === chatType) {
        return;
      }
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      setIsTransitioning(true);
      requestAnimationFrame(() => {
        setSelectedChatId(chatId);
        setSelectedChatType(chatType);
        
        const path = getChatPath(chatId, chatType);
        
        try {
          navigate(path, { replace: true });
        } catch (error) {
          console.error('Navigation failed:', error);
        }
        
        timeoutRef.current = setTimeout(() => {
          setIsTransitioning(false);
          timeoutRef.current = null;
        }, 150);
      });
    } else {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
      
      setIsAnimating(true);
      try {
        const path = getChatPath(chatId, chatType);
        navigate(path);
        animationTimeoutRef.current = setTimeout(() => {
          setIsAnimating(false);
          animationTimeoutRef.current = null;
        }, 300);
      } catch (error) {
        console.error('Navigation failed:', error);
        setIsAnimating(false);
      }
    }
  }, [isDesktop, selectedChatId, selectedChatType, setIsAnimating, navigate, getChatPath]);

  const emptyState = useMemo(() => (
    <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
      <MessageCircle size={80} className="mb-6 opacity-30" />
      <p className="text-xl font-medium mb-2">
        {t('chat.selectChat', { defaultValue: 'Select a chat to start messaging' })}
      </p>
      <p className="text-sm">
        {t('chat.selectChatHint', { defaultValue: 'Choose a conversation from the list' })}
      </p>
    </div>
  ), [t]);

  const leftPanel = useMemo(() => (
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
  ), [handleChatSelect, selectedChatId, selectedChatType, bottomTabsVisible]);

  const rightPanel = useMemo(() => (
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
        emptyState
      )}
    </div>
  ), [selectedChatId, selectedChatType, isTransitioning, emptyState]);

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
          leftPanel={leftPanel}
          rightPanel={rightPanel}
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
