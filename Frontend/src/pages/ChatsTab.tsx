import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChatList } from '@/components/chat/ChatList';
import { GameChat } from './GameChat';
import { MessageCircle } from 'lucide-react';
import { useNavigationStore } from '@/store/navigationStore';
import { BugsTab } from './BugsTab';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { SplitViewLeftPanel, SplitViewRightPanel } from '@/components/SplitViewPanels';
import { useDesktop } from '@/hooks/useDesktop';

export const ChatsTab = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktop = useDesktop();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedChatType, setSelectedChatType] = useState<'user' | 'bug' | 'group' | 'channel' | null>(null);
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
    const path = location.pathname;
    
    let newChatId: string | null = null;
    let newChatType: 'user' | 'bug' | 'group' | 'channel' | null = null;
    let shouldUpdate = false;
    
    if (path.includes('/user-chat/')) {
      const chatId = path.split('/user-chat/')[1]?.split('/')[0];
      if (chatId) {
        if (chatId !== selectedChatId || selectedChatType !== 'user') {
          newChatId = chatId;
          newChatType = 'user';
          shouldUpdate = true;
        }
      }
    } else if (path.includes('/bugs/') && path.includes('/chat')) {
      const match = path.match(/\/bugs\/([^/]+)\/chat/);
      if (match && match[1]) {
        if (match[1] !== selectedChatId || selectedChatType !== 'bug') {
          newChatId = match[1];
          newChatType = 'bug';
          shouldUpdate = true;
        }
      }
    } else if (path.includes('/group-chat/')) {
      const chatId = path.split('/group-chat/')[1]?.split('/')[0];
      if (chatId) {
        if (chatId !== selectedChatId || selectedChatType !== 'group') {
          newChatId = chatId;
          newChatType = 'group';
          shouldUpdate = true;
        }
      }
    } else if (path.includes('/channel-chat/')) {
      const chatId = path.split('/channel-chat/')[1]?.split('/')[0];
      if (chatId) {
        if (chatId !== selectedChatId || selectedChatType !== 'channel') {
          newChatId = chatId;
          newChatType = 'channel';
          shouldUpdate = true;
        }
      }
    } else if (path === '/chats') {
      if (selectedChatId !== null) {
        newChatId = null;
        newChatType = null;
        shouldUpdate = true;
      }
    }
    
    if (shouldUpdate) {
      setSelectedChatId(newChatId);
      setSelectedChatType(newChatType);
    }
  }, [location.pathname, selectedChatId, selectedChatType]);

  useEffect(() => {
    if (chatsFilter === 'bugs' && !location.pathname.includes('/bugs/')) {
      setSelectedChatId(null);
      setSelectedChatType(null);
    }
  }, [chatsFilter, location.pathname]);

  const getChatPath = useCallback((chatId: string, chatType: 'user' | 'bug' | 'group' | 'channel') => {
    return chatType === 'user' 
      ? `/user-chat/${chatId}`
      : chatType === 'bug'
      ? `/bugs/${chatId}/chat`
      : chatType === 'channel'
      ? `/channel-chat/${chatId}`
      : `/group-chat/${chatId}`;
  }, []);

  const handleChatSelect = useCallback((chatId: string, chatType: 'user' | 'bug' | 'group' | 'channel') => {
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
        navigate(path, { replace: true });
        
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
    <SplitViewLeftPanel bottomTabsVisible={bottomTabsVisible}>
      <ChatList onChatSelect={handleChatSelect} isDesktop={true} selectedChatId={selectedChatId} selectedChatType={selectedChatType} />
    </SplitViewLeftPanel>
  ), [handleChatSelect, selectedChatId, selectedChatType, bottomTabsVisible]);

  const rightPanel = useMemo(() => (
    <SplitViewRightPanel 
      selectedId={selectedChatId && selectedChatType ? `${selectedChatType}-${selectedChatId}` : null}
      isTransitioning={isTransitioning}
      emptyState={emptyState}
    >
      <GameChat
        key={`${selectedChatType}-${selectedChatId}`}
        isEmbedded={true}
        chatId={selectedChatId!}
        chatType={selectedChatType!}
      />
    </SplitViewRightPanel>
  ), [selectedChatId, selectedChatType, isTransitioning, emptyState]);

  const isOnBugsListPage = chatsFilter === 'bugs' && !location.pathname.includes('/bugs/');
  
  if (isOnBugsListPage) {
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

  if (selectedChatId && selectedChatType) {
    return (
      <GameChat
        isEmbedded={false}
        chatId={selectedChatId}
        chatType={selectedChatType}
      />
    );
  }

  return (
    <div className="space-y-4">
      <ChatList onChatSelect={handleChatSelect} isDesktop={false} />
    </div>
  );
};
