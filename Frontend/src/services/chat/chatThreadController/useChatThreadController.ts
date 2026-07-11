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
  gameMarkReadRef: React.RefObject<import('@/types').Game | null>;
  groupChannel: import('@/api/chat').GroupChannel | null;
  groupChannelId?: string;
  loadContext: (
    options?: import('@/pages/GameChat/useGameChatContext').LoadContextOptions
  ) => Promise<unknown>;
  setCurrentChatType: (t: ChatType) => void;
  setIsBlockedByUser: (v: boolean) => void;
  setIsMuted: (v: boolean) => void;
  setTranslateToLanguageForChat: (v: string | null) => void;
  isLoadingContext: boolean;
  setIsLoadingContext: (v: boolean) => void;
  setIsGameChatAccessDenied: (v: boolean) => void;
  isBlockedByUser: boolean;
  isJoiningAsGuest: boolean;
  isGameChatArchived?: boolean;
  isGameChatAccessDenied?: boolean;
};

export function useChatThreadController(params: UseChatThreadControllerParams) {
  const {
    user,
    setUserChat,
    userChat,
    isEmbedded = false,
    initialChatType,
    game,
    gameMarkReadRef,
    groupChannel,
    groupChannelId,
    loadContext,
    setCurrentChatType,
    setIsBlockedByUser,
    setIsMuted,
    setTranslateToLanguageForChat,
    isLoadingContext,
    setIsLoadingContext,
    setIsGameChatAccessDenied,
    isBlockedByUser,
    isJoiningAsGuest,
    isGameChatArchived = false,
    isGameChatAccessDenied = false,
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
    isGameChatArchived,
    onGameChatAccessDenied: () => setIsGameChatAccessDenied(true),
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
    gameMarkReadRef,
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

  const markReadInput = useCallback(
    () => ({
      id,
      contextType,
      game: gameMarkReadRef.current,
      userId: user?.id,
      gameChatType: effectiveChatType,
      groupChannelId,
    }),
    [id, contextType, gameMarkReadRef, user?.id, effectiveChatType, groupChannelId]
  );

  const markRead = useCallback(() => {
    if (isGameChatArchived) return;
    if (contextType === 'GAME' && id && isThreadArchivedInMemory('GAME', id)) return;
    controllerRef.current.markRead(markReadInput());
  }, [id, contextType, isGameChatArchived, markReadInput]);

  const markReadWhileViewing = useCallback(() => {
    if (isGameChatArchived) return;
    if (contextType === 'GAME' && id && isThreadArchivedInMemory('GAME', id)) return;
    controllerRef.current.markReadWhileViewing(markReadInput());
  }, [id, contextType, isGameChatArchived, markReadInput]);

  const prevEffectiveChatTypeRef = useRef<ChatType | null>(null);
  useEffect(() => {
    if (contextType !== 'GAME' || !id) return;
    const prev = prevEffectiveChatTypeRef.current;
    prevEffectiveChatTypeRef.current = effectiveChatType;
    if (prev !== null && prev !== effectiveChatType) {
      markReadWhileViewing();
    }
  }, [contextType, id, effectiveChatType, markReadWhileViewing]);

  useThreadSocket({
    id,
    contextType,
    effectiveChatType,
    currentIdRef,
    userId: user?.id,
    setMessages: session.setMessages,
    messagesRef: session.messagesRef,
    onInboundMessage: domain.onInboundMessage,
    onMarkReadWhileViewing: markReadWhileViewing,
    reloadMessagesFirstPage,
    onAfterSocketBatch: session.pinAfterSocketMergeIfAllowed,
    openPaintGeneration: session.openPaintGeneration,
    isLoadingContext,
    isGameChatArchived,
    isGameChatAccessDenied,
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

  return {
    controller: controllerRef.current,
    markRead,
    markReadWhileViewing,
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
