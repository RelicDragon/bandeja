import { useCallback, useEffect } from 'react';
import type { ChatMessage, UserChat } from '@/api/chat';
import { logReloadMessagesFirstPage } from '@/services/chat/chatOpenTrace';
import { useGameChatMessages, type UseGameChatMessagesParams } from './useGameChatMessages';
import { useGameChatOptimistic } from './useGameChatOptimistic';

export type UseGameChatSessionParams = UseGameChatMessagesParams & {
  user: { id: string } | null;
  setUserChat: React.Dispatch<React.SetStateAction<UserChat | null>>;
  onInboundMessage?: (message: ChatMessage) => void;
};

export function useGameChatSession({
  user,
  setUserChat,
  onInboundMessage,
  ...sessionParams
}: UseGameChatSessionParams) {
  const session = useGameChatMessages(sessionParams);
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
  } = useGameChatOptimistic({
    id: sessionParams.id,
    contextType: sessionParams.contextType,
    currentChatType: sessionParams.currentChatType,
    user,
    setMessages: session.setMessages,
    messagesRef: session.messagesRef,
    scrollToBottom: session.scrollToBottom,
    setUserChat,
  });

  const handleNewMessage = useCallback(
    (message: ChatMessage) => {
      onInboundMessage?.(message);
      return handleNewMessageFromOptimistic(message);
    },
    [onInboundMessage, handleNewMessageFromOptimistic]
  );

  useEffect(() => {
    handleNewMessageRef.current = handleNewMessage;
  }, [handleNewMessage, handleNewMessageRef]);

  const reloadMessagesFirstPage = useCallback(async () => {
    const { id, contextType, effectiveChatType } = sessionParams;
    if (!id) return;
    logReloadMessagesFirstPage(contextType, id);
    await loadMessages(false, contextType === 'GAME' ? effectiveChatType : undefined);
  }, [sessionParams, loadMessages]);

  return {
    ...session,
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
