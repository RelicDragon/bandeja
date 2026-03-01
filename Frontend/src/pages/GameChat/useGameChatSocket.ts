import { useEffect } from 'react';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useNavigationStore } from '@/store/navigationStore';
import { usePlayersStore } from '@/store/playersStore';
import { socketService } from '@/services/socketService';
import type { ChatContextType } from '@/api/chat';
import type { ChatMessageWithStatus } from '@/api/chat';

export interface UseGameChatSocketParams {
  id: string | undefined;
  contextType: ChatContextType;
  userId: string | undefined;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  scrollToBottom: () => void;
  justLoadedOlderMessagesRef: React.MutableRefObject<boolean>;
  handleNewMessage: (message: import('@/api/chat').ChatMessage) => string | void;
  handleMessageReaction: (reaction: any) => void;
  handleReadReceipt: (readReceipt: any) => void;
  handleMessageDeleted: (data: { messageId: string }) => void;
  fetchPinnedMessages: () => void;
  handleMessageUpdated: (updated: import('@/api/chat').ChatMessage) => void;
  isLoadingMessages: boolean;
  isSwitchingChatType: boolean;
  isLoadingMore: boolean;
  isInitialLoad: boolean;
  messagesLength: number;
}

export function useGameChatSocket({
  id,
  contextType,
  userId,
  setMessages,
  messagesRef,
  scrollToBottom,
  justLoadedOlderMessagesRef,
  handleNewMessage,
  handleMessageReaction,
  handleReadReceipt,
  handleMessageDeleted,
  fetchPinnedMessages,
  handleMessageUpdated,
  isLoadingMessages,
  isSwitchingChatType,
  isLoadingMore,
  isInitialLoad,
  messagesLength,
}: UseGameChatSocketParams) {
  const contextKey = id ? `${contextType}:${id}` : '';
  const missedForContext = useChatSyncStore((s) => (contextKey ? s.missedMessagesByContext[contextKey] ?? [] : []));

  const lastChatMessage = useSocketEventsStore((s) => s.lastChatMessage);
  const lastChatMessageUpdated = useSocketEventsStore((s) => s.lastChatMessageUpdated);
  const lastChatReaction = useSocketEventsStore((s) => s.lastChatReaction);
  const lastChatReadReceipt = useSocketEventsStore((s) => s.lastChatReadReceipt);
  const lastChatDeleted = useSocketEventsStore((s) => s.lastChatDeleted);
  const lastSyncRequired = useSocketEventsStore((s) => s.lastSyncRequired);
  const lastPollVote = useSocketEventsStore((s) => s.lastPollVote);

  useEffect(() => {
    if (!id) return;
    const setupSocket = async () => {
      await socketService.joinChatRoom(contextType, id);
    };
    setupSocket();
    return () => {
      socketService.leaveChatRoom(contextType, id);
    };
  }, [id, contextType]);

  useEffect(() => {
    if (contextType === 'GROUP' && id) {
      useNavigationStore.getState().setViewingGroupChannelId(id);
      return () => useNavigationStore.getState().setViewingGroupChannelId(null);
    }
  }, [contextType, id]);

  useEffect(() => {
    if (missedForContext.length === 0 || !id) return;
    const toMerge = useChatSyncStore.getState().getAndClearMissed(contextType, id);
    if (toMerge.length === 0) return;
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      const added = toMerge.filter((m) => !ids.has(m.id));
      if (added.length === 0) return prev;
      const next = [...prev, ...added].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      messagesRef.current = next;
      const lastId = next[next.length - 1]?.id;
      if (lastId) useChatSyncStore.getState().setLastMessageId(contextType, id, lastId);
      return next;
    });
    scrollToBottom();
  }, [missedForContext.length, contextType, id, scrollToBottom, setMessages, messagesRef]);

  useEffect(() => {
    if (!lastChatMessage || lastChatMessage.contextType !== contextType || lastChatMessage.contextId !== id) return;
    handleNewMessage(lastChatMessage.message);

    if (id) {
      if (contextType === 'USER') {
        usePlayersStore.getState().updateUnreadCount(id, 0);
      } else if (contextType === 'GROUP') {
        window.dispatchEvent(new CustomEvent('chat-viewing-clear-unread', { detail: { contextType: 'GROUP', contextId: id } }));
      }
    }

    if (lastChatMessage.messageId && lastChatMessage.message?.senderId !== userId) {
      socketService.acknowledgeMessage(
        lastChatMessage.messageId,
        contextType as 'GAME' | 'BUG' | 'USER' | 'GROUP',
        id
      );
      socketService.confirmMessageReceipt(lastChatMessage.messageId, 'socket');
    }
  }, [lastChatMessage, contextType, id, userId, handleNewMessage]);

  useEffect(() => {
    if (!lastChatReaction || lastChatReaction.contextType !== contextType || lastChatReaction.contextId !== id) return;
    handleMessageReaction(lastChatReaction.reaction);
  }, [lastChatReaction, contextType, id, handleMessageReaction]);

  useEffect(() => {
    if (!lastChatReadReceipt || lastChatReadReceipt.contextType !== contextType || lastChatReadReceipt.contextId !== id) return;
    handleReadReceipt(lastChatReadReceipt.readReceipt);
  }, [lastChatReadReceipt, contextType, id, handleReadReceipt]);

  useEffect(() => {
    if (!lastChatDeleted || lastChatDeleted.contextType !== contextType || lastChatDeleted.contextId !== id) return;
    handleMessageDeleted({ messageId: lastChatDeleted.messageId });
    fetchPinnedMessages();
  }, [lastChatDeleted, contextType, id, handleMessageDeleted, fetchPinnedMessages]);

  useEffect(() => {
    if (!lastChatMessageUpdated || lastChatMessageUpdated.contextType !== contextType || lastChatMessageUpdated.contextId !== id || !lastChatMessageUpdated.message) return;
    handleMessageUpdated(lastChatMessageUpdated.message);
  }, [lastChatMessageUpdated, contextType, id, handleMessageUpdated]);

  useEffect(() => {
    if (!lastSyncRequired || !id) return;
    const currentMessages = messagesRef.current;
    if (currentMessages.length > 0) {
      const lastMessage = currentMessages[currentMessages.length - 1];
      socketService.syncMessages(contextType as 'GAME' | 'BUG' | 'USER' | 'GROUP', id, lastMessage.id);
    }
  }, [lastSyncRequired, contextType, id, messagesRef]);

  useEffect(() => {
    if (!lastPollVote || lastPollVote.contextType !== contextType || lastPollVote.contextId !== id) return;
    setMessages((prevMessages) => {
      const newMessages = prevMessages.map((message) => {
        if (message.id === lastPollVote.messageId && message.poll) {
          return { ...message, poll: lastPollVote.updatedPoll };
        }
        return message;
      });
      messagesRef.current = newMessages;
      return newMessages;
    });
  }, [lastPollVote, contextType, id, setMessages, messagesRef]);

  useEffect(() => {
    if (justLoadedOlderMessagesRef.current) return;
    if (!isLoadingMessages && !isSwitchingChatType && !isLoadingMore && !isInitialLoad && messagesLength > 0) {
      scrollToBottom();
    }
  }, [isLoadingMessages, isSwitchingChatType, isLoadingMore, isInitialLoad, messagesLength, scrollToBottom, justLoadedOlderMessagesRef]);
}
