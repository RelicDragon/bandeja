import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { ChatMessage, UserChat } from '@/api/chat';
import { logReloadMessagesFirstPage } from '@/services/chat/chatOpenTrace';
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import { ChatThreadController } from './ChatThreadController';
import { useThreadMessages, type UseThreadMessagesParams } from './useThreadMessages';
import { useThreadOptimistic } from './useThreadOptimistic';
import { useThreadOpenEffects } from './useThreadOpenEffects';
import { useThreadSocket, type UseThreadSocketParams } from './useThreadSocket';
import { useThreadDomain } from './useThreadDomain';

export type ChatThreadSocketHandlers = Pick<
  UseThreadSocketParams,
  | 'handleMessageReaction'
  | 'handleReadReceipt'
  | 'handleMessageDeleted'
  | 'fetchPinnedMessages'
  | 'handleMessageUpdated'
>;

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
  socketHandlersRef: React.MutableRefObject<ChatThreadSocketHandlers | null>;
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
    socketHandlersRef,
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
    handleNewMessage: handleNewMessageFromOptimistic,
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
    isBlockedByUser,
    isJoiningAsGuest,
    socketHandlersRef,
  });

  const onInboundRef = useRef(domain.onInboundMessage);
  onInboundRef.current = domain.onInboundMessage;

  const handleNewMessage = useCallback(
    (message: ChatMessage) => {
      onInboundRef.current?.(message);
      return handleNewMessageFromOptimistic(message);
    },
    [handleNewMessageFromOptimistic]
  );

  useEffect(() => {
    handleNewMessageRef.current = handleNewMessage;
  }, [handleNewMessage, handleNewMessageRef]);

  const reloadMessagesFirstPage = useCallback(async () => {
    if (!id) return;
    logReloadMessagesFirstPage(contextType, id);
    await loadMessages(false, contextType === 'GAME' ? effectiveChatType : undefined);
  }, [id, contextType, effectiveChatType, loadMessages]);

  const noopReaction = useCallback(() => {}, []);
  const noopDeleted = useCallback((_data: { messageId: string }) => {}, []);
  const noopUpdated = useCallback((_updated: ChatMessage) => {}, []);
  const noopFetchPinned = useCallback(() => {}, []);

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
  });

  useThreadSocket({
    id,
    contextType,
    effectiveChatType,
    currentIdRef,
    userId: user?.id,
    setMessages: session.setMessages,
    messagesRef: session.messagesRef,
    chatContainerRef,
    handleNewMessage,
    handleMessageReaction: (r) => socketHandlersRef.current?.handleMessageReaction(r) ?? noopReaction(),
    handleReadReceipt: (r) => socketHandlersRef.current?.handleReadReceipt(r) ?? noopReaction(),
    handleMessageDeleted: (d) => socketHandlersRef.current?.handleMessageDeleted(d) ?? noopDeleted(d),
    fetchPinnedMessages: () => socketHandlersRef.current?.fetchPinnedMessages() ?? noopFetchPinned(),
    handleMessageUpdated: (m) => socketHandlersRef.current?.handleMessageUpdated(m) ?? noopUpdated(m),
    reloadMessagesFirstPage,
    onAfterSocketBatch: session.pinAfterSocketMergeIfAllowed,
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
    controllerRef.current.markRead({
      id,
      contextType,
      game,
      userId: user?.id,
      gameChatType: effectiveChatType,
      groupChannelId,
    });
  }, [id, contextType, game, user?.id, effectiveChatType, groupChannelId]);

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
    handleNewMessage,
    handleNewMessageRef,
    reloadMessagesFirstPage,
  };
}
