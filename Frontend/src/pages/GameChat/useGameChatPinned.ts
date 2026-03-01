import React, { useState, useCallback, useMemo, useEffect, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { chatApi, type ChatMessage } from '@/api/chat';
import { socketService } from '@/services/socketService';
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';

export interface UseGameChatPinnedParams {
  id: string | undefined;
  contextType: ChatContextType;
  effectiveChatType: ChatType;
  canAccessChat: boolean;
  chatContainerRef: RefObject<HTMLDivElement | null>;
  loadMessagesBeforeMessageId: (messageId: string) => Promise<boolean>;
  messagesRef: React.MutableRefObject<{ id: string }[]>;
}

export function useGameChatPinned({
  id,
  contextType,
  effectiveChatType,
  canAccessChat,
  chatContainerRef,
  loadMessagesBeforeMessageId,
  messagesRef,
}: UseGameChatPinnedParams) {
  const { t } = useTranslation();
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const [pinnedBarTopIndex, setPinnedBarTopIndex] = useState(0);
  const [loadingScrollTargetId, setLoadingScrollTargetId] = useState<string | null>(null);

  const fetchPinnedMessages = useCallback(async () => {
    if (!id || !canAccessChat) return;
    try {
      const list = await chatApi.getPinnedMessages(contextType, id, effectiveChatType);
      setPinnedMessages(list);
      setPinnedBarTopIndex(0);
    } catch {
      setPinnedMessages([]);
      setPinnedBarTopIndex(0);
    }
  }, [id, contextType, effectiveChatType, canAccessChat]);

  const handleScrollToMessage = useCallback((messageId: string) => {
    if (!chatContainerRef.current) return;
    const messageElement = chatContainerRef.current.querySelector(`#message-${messageId}`) as HTMLElement;
    if (messageElement) {
      const messagesContainer = messageElement.closest('.overflow-y-auto') as HTMLElement;
      if (messagesContainer) {
        const messageOffsetTop = messageElement.offsetTop;
        const containerHeight = messagesContainer.clientHeight;
        const messageHeight = messageElement.offsetHeight;
        const targetScrollTop = messageOffsetTop - (containerHeight / 2) + (messageHeight / 2);
        messagesContainer.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth',
        });
      } else {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      messageElement.classList.add('message-highlight', 'ring-2', 'ring-blue-500', 'ring-opacity-50', 'bg-blue-50', 'dark:bg-blue-900/20');
      setTimeout(() => {
        messageElement.classList.remove('message-highlight', 'ring-2', 'ring-blue-500', 'ring-opacity-50', 'bg-blue-50', 'dark:bg-blue-900/20');
      }, 3000);
    }
  }, [chatContainerRef]);

  const scrollToMessageId = useCallback(
    async (messageId: string) => {
      const inList = messagesRef.current.some((m) => m.id === messageId);
      if (inList) {
        handleScrollToMessage(messageId);
        return;
      }
      setLoadingScrollTargetId(messageId);
      try {
        const found = await loadMessagesBeforeMessageId(messageId);
        if (found) {
          handleScrollToMessage(messageId);
        } else {
          toast.error(t('chat.pinnedMessageNotFound', { defaultValue: 'Message no longer available' }));
        }
      } finally {
        setLoadingScrollTargetId(null);
      }
    },
    [handleScrollToMessage, loadMessagesBeforeMessageId, t, messagesRef]
  );

  const pinnedMessagesOrdered = useMemo(() => {
    const n = pinnedMessages.length;
    if (!n) return [];
    return Array.from({ length: n }, (_, i) => pinnedMessages[(pinnedBarTopIndex + i) % n]);
  }, [pinnedMessages, pinnedBarTopIndex]);

  const handlePinnedBarClick = useCallback(
    (_messageId: string) => {
      const n = pinnedMessages.length;
      if (!n) return;
      const topMessageId = pinnedMessages[pinnedBarTopIndex].id;
      scrollToMessageId(topMessageId);
      setPinnedBarTopIndex((prev) => (prev - 1 + n) % n);
    },
    [pinnedMessages, pinnedBarTopIndex, scrollToMessageId]
  );

  useEffect(() => {
    if (pinnedBarTopIndex >= pinnedMessages.length) {
      setPinnedBarTopIndex(0);
    }
  }, [pinnedMessages.length, pinnedBarTopIndex]);

  const handlePinMessage = useCallback(
    async (message: ChatMessage) => {
      try {
        await chatApi.pinMessage(message.id);
        await fetchPinnedMessages();
      } catch {
        toast.error(t('chat.pinFailed', { defaultValue: 'Failed to pin message' }));
      }
    },
    [fetchPinnedMessages, t]
  );

  const handleUnpinMessage = useCallback(
    async (messageId: string) => {
      try {
        await chatApi.unpinMessage(messageId);
        await fetchPinnedMessages();
      } catch {
        toast.error(t('chat.unpinFailed', { defaultValue: 'Failed to unpin message' }));
      }
    },
    [fetchPinnedMessages, t]
  );

  useEffect(() => {
    if (!id || !canAccessChat) return;
    fetchPinnedMessages();
  }, [id, effectiveChatType, canAccessChat, fetchPinnedMessages]);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket || !id) return;
    const handler = (data: { contextType: string; contextId: string }) => {
      if (data.contextType === contextType && data.contextId === id) fetchPinnedMessages();
    };
    socket.on('chat:pinned-messages-updated', handler);
    return () => {
      socket.off('chat:pinned-messages-updated', handler);
    };
  }, [id, contextType, fetchPinnedMessages]);

  return {
    pinnedMessages,
    pinnedMessagesOrdered,
    pinnedBarTopIndex,
    loadingScrollTargetId,
    fetchPinnedMessages,
    handleScrollToMessage,
    scrollToMessageId,
    handlePinnedBarClick,
    handlePinMessage,
    handleUnpinMessage,
  };
}
