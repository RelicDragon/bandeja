import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { UserChat } from '@/api/chat';
import { logReloadMessagesFirstPage } from '@/services/chat/chatOpenTrace';
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import { ChatThreadController } from './ChatThreadController';
import { useThreadMessages, type UseThreadMessagesParams } from './useThreadMessages';
import { useThreadOptimistic } from './useThreadOptimistic';
import { useThreadOpenEffects } from './useThreadOpenEffects';
import { useThreadSocket } from './useThreadSocket';
import { useThreadDomain } from './useThreadDomain';
import { isThreadArchivedInMemory } from '@/services/chat/chatThreadLifecycle';

export type UseChatThreadControllerParams = UseThreadMessagesParams & {
  user: { id: string; language?: string | null; isAdmin?: boolean | null } | null;
  setUserChat: React.Dispatch<React.SetStateAction<UserChat | null>>;
  userChat: UserChat | null;
  isEmbedded?: boolean;
  initialChatType: ChatType | undefined;
  game: import('@/types').Game | null;
  groupChannel: import('@/api/chat').GroupChannel | null;
  groupChannelId?: string;
  loadContext: (
    options?: import('@/pages/GameChat/useGameChatContext').LoadContextOptions
  ) => Promise<unknown>;
  setCurrentChatType: (t: ChatType) => void;
  setIsBlockedByUser: (v: boolean) => void;
  setIsMuted: (v: boolean) => void;
  setTranslateToLanguageForChat: (v: string | null) => void;
  setIsLoadingContext: (v: boolean) => void;
  isBlockedByUser: boolean;
  isJoiningAsGuest: boolean;
  isGameChatArchived?: boolean;
};

export function useChatThreadController(params: UseChatThreadControllerParams) {
  const {
    user,
    setUserChat,
    userChat,
    isEmbedded = false,
    initialChatType,
    game,
    groupChannel,
    groupChannelId,
    loadContext,
    setCurrentChatType,
    setIsBlockedByUser,
    setIsMuted,
    setTranslateToLanguageForChat,
    setIsLoadingContext,
    isBlockedByUser,
    isJoiningAsGuest,
    isGameChatArchived = false,
    id,
    contextType,
    effectiveChatType,
    currentChatType,
    chatContainerRef,
    currentIdRef,
    freshOpenSignal,
    openAnchorMessageId,
    messageListRef,
    ...rest
  } = params;

  const controllerRef = useRef(new ChatThreadController());
  const prevIdRef = useRef<string | undefined>(id);
  const prevContextTypeRef = useRef<ChatContextType | undefined>(contextType);

  const session = useThreadMessages({
    id,
    contextType,
    currentChatType,
    effectiveChatType,
    chatContainerRef,
    messageListRef,
    currentIdRef,
    freshOpenSignal,
    openAnchorMessageId,
    ...rest,
  });

  const { loadMessages } = session;

  const {
    handleAddOptimisticMessage,
    handleMarkFailed,
    handleSendQueued,
    handleResendQueued,
    handleRemoveFromQueue,
    handleSendFailed,
    handleReplaceOptimisticWithServerMessage,
    handleNewMessageRef,
  } = useThreadOptimistic({
    id,
    contextType,
    currentChatType,
    user,
    setMessages: session.setMessages,
    messagesRef: session.messagesRef,
    scrollToBottom: session.scrollToBottom,
    setUserChat,
  });

  const domain = useThreadDomain({
    id,
    contextType,
    currentChatType,
    effectiveChatType,
    game,
    groupChannel,
    userChat,
    user,
    messages: session.messages,
    setMessages: session.setMessages,
    messagesRef: session.messagesRef,
    setUserChat,
    setCurrentChatType,
    chatContainerRef,
    messageListRef,
    loadMessagesBeforeMessageId: session.loadMessagesBeforeMessageId,
    beginScrollTargetSession: session.beginScrollTargetSession,
    endScrollTargetSession: session.endScrollTargetSession,
    isBlockedByUser,
    isJoiningAsGuest,
    isGameChatArchived,
  });

  const reloadMessagesFirstPage = useCallback(async () => {
    if (!id) return;
    logReloadMessagesFirstPage(contextType, id);
    await loadMessages(false, contextType === 'GAME' ? effectiveChatType : undefined);
  }, [id, contextType, effectiveChatType, loadMessages]);

  useThreadOpenEffects({
    id,
    user,
    contextType,
    initialChatType,
    currentChatType,
    game,
    groupChannelId,
    loadContext,
    bootstrapThread: session.bootstrapThread,
    userChat,
    handleMarkFailed,
    handleReplaceOptimistic: handleReplaceOptimisticWithServerMessage,
    handleNewMessageRef,
    loadingIdRef: session.loadingIdRef,
    hasLoadedRef: session.hasLoadedRef,
    isLoadingRef: session.isLoadingRef,
    messagesRef: session.messagesRef,
    openPaintCommittedRef: session.openPaintCommittedRef,
    freshOpenSignal,
    setMessages: session.setMessages,
    setCurrentChatType,
    setIsBlockedByUser,
    setIsMuted,
    setTranslateToLanguageForChat,
    setIsInitialLoad: session.setIsInitialLoad,
    setIsLoadingMessages: session.setIsLoadingMessages,
    setIsLoadingContext,
    controllerRef,
    isGameChatArchived,
  });

  useThreadSocket({
    id,
    contextType,
    effectiveChatType,
    currentIdRef,
    userId: user?.id,
    setMessages: session.setMessages,
    messagesRef: session.messagesRef,
    onInboundMessage: domain.onInboundMessage,
    reloadMessagesFirstPage,
    onAfterSocketBatch: session.pinAfterSocketMergeIfAllowed,
    openPaintGeneration: session.openPaintGeneration,
  });

  useLayoutEffect(() => {
    if (!id) {
      controllerRef.current.close();
      return;
    }
    controllerRef.current.open({
      contextType,
      contextId: id,
      chatType: contextType === 'GAME' ? effectiveChatType : undefined,
      forceReload: freshOpenSignal,
      anchorMessageId: openAnchorMessageId,
      isEmbedded,
    });
    if (session.openPaintCommittedRef.current) {
      controllerRef.current.markOpenReady(session.messages.length);
    }
  }, [
    id,
    contextType,
    effectiveChatType,
    freshOpenSignal,
    openAnchorMessageId,
    isEmbedded,
    session.messages.length,
    session.openPaintCommittedRef,
  ]);

  useEffect(() => {
    if (session.openPaintCommittedRef.current) {
      controllerRef.current.markOpenReady(session.messages.length);
    }
    controllerRef.current.syncMessageCount(session.messages.length);
  }, [session.messages.length, session.openPaintCommittedRef]);

  useLayoutEffect(() => {
    const prevId = prevIdRef.current;
    const prevCtx = prevContextTypeRef.current;
    if (prevId && (prevId !== id || prevCtx !== contextType)) {
      controllerRef.current.close();
      controllerRef.current = new ChatThreadController();
    }
    prevIdRef.current = id;
    prevContextTypeRef.current = contextType;
  }, [id, contextType]);

  useEffect(() => () => { controllerRef.current.close(); }, []);

  const markRead = useCallback(() => {
    if (isGameChatArchived) return;
    if (contextType === 'GAME' && id && isThreadArchivedInMemory('GAME', id)) return;
    controllerRef.current.markRead({
      id,
      contextType,
      game,
      userId: user?.id,
      gameChatType: effectiveChatType,
      groupChannelId,
    });
  }, [id, contextType, game, user?.id, effectiveChatType, groupChannelId, isGameChatArchived]);

  return {
    controller: controllerRef.current,
    markRead,
    ...session,
    ...domain,
    handleAddOptimisticMessage,
    handleMarkFailed,
    handleSendQueued,
    handleResendQueued,
    handleRemoveFromQueue,
    handleSendFailed,
    handleReplaceOptimisticWithServerMessage,
    handleNewMessageRef,
    reloadMessagesFirstPage,
  };
}
