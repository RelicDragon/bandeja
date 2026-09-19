import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import type { UserChat, GroupChannel } from '@/api/chat';
import { ChatList, ChatType } from '@/components/chat/ChatList';
import type { ChatSelectNavOptions } from '@/components/chat/chatListTypes';
import { GameChat } from './GameChat';
import { MessageCircle } from 'lucide-react';
import { useShellNavStore } from '@/store/shellNavStore';
import { useChatsFromUrl } from '@/hooks/useChatsFromUrl';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { SplitViewLeftPanel, SplitViewRightPanel } from '@/components/SplitViewPanels';
import { useDesktop } from '@/hooks/useDesktop';
import { parseChatSelectionFromPath } from '@/utils/chatSelectionFromPath';
import {
  buildChatSelectPath,
  desktopRightPanelTransition,
  isChatPanelReady,
  shouldRenderEmbeddedGameChat,
} from './chatsTabShell';

function locationStateForChatNav(
  options?: ChatSelectNavOptions
): { chat?: UserChat; groupChannel?: GroupChannel } | undefined {
  if (!options?.userChat && !options?.groupChannel) return undefined;
  const state: { chat?: UserChat; groupChannel?: GroupChannel } = {};
  if (options.userChat) state.chat = options.userChat;
  if (options.groupChannel) state.groupChannel = options.groupChannel;
  return state;
}

export const ChatsTab = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktop = useDesktop();
  const { filter: chatsFilter, role: marketChatRole, item: marketItemId } = useChatsFromUrl();
  /**
   * The path is the source of truth. `optimisticSelection` only covers the window
   * between a click and the router committing the new URL, and is scoped to the path
   * it was made on — mirroring the path into state cost an extra render per navigation.
   */
  const [optimisticSelection, setOptimisticSelection] = useState<
    { id: string; type: ChatType; fromPath: string } | null
  >(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const setIsAnimating = useShellNavStore((s) => s.setIsAnimating);
  const bottomTabsVisible = useShellNavStore((s) => s.bottomTabsVisible);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const pathSelection = useMemo(
    () => parseChatSelectionFromPath(location.pathname),
    [location.pathname]
  );
  const pendingSelection =
    optimisticSelection && optimisticSelection.fromPath === location.pathname
      ? optimisticSelection
      : null;
  const selectedChatId = pathSelection.id ?? pendingSelection?.id ?? null;
  const selectedChatType = pathSelection.type ?? pendingSelection?.type ?? null;

  /** Path wins over list selection so push/deep-link opens the correct thread on first paint. */
  const activeChatSelection = useMemo((): { id: string; type: ChatType } | null => {
    if (pathSelection.id && pathSelection.type) {
      return { id: pathSelection.id, type: pathSelection.type };
    }
    if (selectedChatId && selectedChatType) {
      return { id: selectedChatId, type: selectedChatType };
    }
    return null;
  }, [pathSelection.id, pathSelection.type, selectedChatId, selectedChatType]);
  const chatPanelReady = isChatPanelReady(
    isDesktop,
    selectedChatId,
    selectedChatType,
    pathSelection
  );
  const rightPanelTransition = desktopRightPanelTransition(isTransitioning, chatPanelReady);

  useEffect(() => {
    if (isDesktop && chatPanelReady) {
      setIsTransitioning(false);
    }
  }, [isDesktop, chatPanelReady]);

  const getChatPath = useCallback(
    (chatId: string, chatType: ChatType) =>
      buildChatSelectPath(chatId, chatType, chatsFilter, {
        role: marketChatRole,
        item: marketItemId,
      }),
    [chatsFilter, marketChatRole, marketItemId]
  );

  const handleChatSelect = useCallback((chatId: string, chatType: ChatType, options?: ChatSelectNavOptions) => {
    const fromSearch = !!options?.searchQuery;
    const path = getChatPath(chatId, chatType);
    const listNavState = locationStateForChatNav(options);

    if (fromSearch) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
      setIsAnimating(true);
      setIsTransitioning(true);
      setOptimisticSelection({ id: chatId, type: chatType, fromPath: location.pathname });
      try {
        if (chatType === 'game') {
          const gameState =
            options?.initialChatType != null ? { initialChatType: options.initialChatType } : undefined;
          navigate(`/games/${chatId}/chat`, gameState ? { state: gameState } : undefined);
        } else {
          navigate(path, listNavState ? { state: listNavState } : undefined);
        }
      } catch (error) {
        console.error('Navigation failed:', error);
      } finally {
        setTimeout(() => {
          setIsAnimating(false);
          setIsTransitioning(false);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
          if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
          animationTimeoutRef.current = null;
        }, isDesktop ? 150 : 300);
      }
      return;
    }

    if (isDesktop) {
      if (selectedChatId === chatId && selectedChatType === chatType) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setIsTransitioning(true);
      setOptimisticSelection({ id: chatId, type: chatType, fromPath: location.pathname });
      navigate(path, { replace: true, state: listNavState ?? {} });
      timeoutRef.current = setTimeout(() => setIsTransitioning(false), 150);
    } else {
      if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
      setIsAnimating(true);
      try {
        navigate(path, listNavState ? { state: listNavState } : undefined);
        animationTimeoutRef.current = setTimeout(() => {
          setIsAnimating(false);
          animationTimeoutRef.current = null;
        }, 300);
      } catch (error) {
        console.error('Navigation failed:', error);
        setIsAnimating(false);
      }
    }
  }, [isDesktop, selectedChatId, selectedChatType, setIsAnimating, navigate, getChatPath, location.pathname]);

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

  const showEmbeddedGameChat = shouldRenderEmbeddedGameChat(selectedChatId, selectedChatType);

  const rightPanel = useMemo(() => (
    <SplitViewRightPanel
      selectedId={showEmbeddedGameChat ? `${selectedChatType}-${selectedChatId}` : null}
      showOverlay={rightPanelTransition.showOverlay}
      hideContent={rightPanelTransition.hideContent}
      emptyState={emptyState}
    >
      {showEmbeddedGameChat ? (
        /* A1.1 stable shell: chatId/chatType props reset thread; no remount key */
        <GameChat isEmbedded chatId={selectedChatId!} chatType={selectedChatType!} />
      ) : null}
    </SplitViewRightPanel>
  ), [
    selectedChatId,
    selectedChatType,
    showEmbeddedGameChat,
    rightPanelTransition.showOverlay,
    rightPanelTransition.hideContent,
    emptyState,
  ]);

  if (isDesktop) {
    return (
      <div className="fixed inset-x-0 bottom-0 top-[calc(var(--app-header-height,4rem)+env(safe-area-inset-top))] overflow-hidden">
        <ResizableSplitter
          defaultLeftWidth={40}
          minLeftWidth={250}
          maxLeftWidth={600}
          leftPanel={
            <SplitViewLeftPanel bottomTabsVisible={bottomTabsVisible}>
              <ChatList
                onChatSelect={handleChatSelect}
                isDesktop={true}
                selectedChatId={selectedChatId}
                selectedChatType={selectedChatType}
              />
            </SplitViewLeftPanel>
          }
          rightPanel={rightPanel}
        />
      </div>
    );
  }

  if (activeChatSelection) {
    return (
      <GameChat
        isEmbedded={false}
        chatId={activeChatSelection.id}
        chatType={activeChatSelection.type}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatList onChatSelect={handleChatSelect} isDesktop={false} />
    </div>
  );
};
