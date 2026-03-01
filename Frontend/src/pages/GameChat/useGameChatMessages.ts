import { useState, useCallback, useRef } from 'react';
import { chatApi, type ChatMessage, type ChatMessageWithStatus } from '@/api/chat';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { normalizeChatType } from '@/utils/chatType';
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import type { RefObject } from 'react';

export interface UseGameChatMessagesParams {
  id: string | undefined;
  contextType: ChatContextType;
  currentChatType: ChatType;
  effectiveChatType: ChatType;
  isEmbedded: boolean;
  chatContainerRef: RefObject<HTMLDivElement | null>;
  currentIdRef: RefObject<string | undefined>;
}

export function useGameChatMessages({
  id,
  contextType,
  currentChatType,
  effectiveChatType,
  isEmbedded,
  chatContainerRef,
  currentIdRef,
}: UseGameChatMessagesParams) {
  const [messages, setMessages] = useState<ChatMessageWithStatus[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSwitchingChatType, setIsSwitchingChatType] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const justLoadedOlderMessagesRef = useRef(false);
  const messagesRef = useRef<ChatMessageWithStatus[]>([]);
  const loadingIdRef = useRef<string | undefined>(undefined);
  const hasLoadedRef = useRef(false);
  const isLoadingRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    const scroll = () => {
      if (chatContainerRef.current) {
        const messagesContainer = chatContainerRef.current.querySelector('.overflow-y-auto') as HTMLElement;
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }
    };
    requestAnimationFrame(() => {
      scroll();
      setTimeout(scroll, 50);
      setTimeout(scroll, 150);
    });
  }, [chatContainerRef]);

  const loadMessages = useCallback(
    async (pageNum = 1, append = false, chatTypeOverride?: ChatType) => {
      if (!id) return;
      const requestId = id;
      const effectiveType = chatTypeOverride ?? currentChatType;
      try {
        if (!append) {
          setIsLoadingMessages(true);
          setIsInitialLoad(true);
        }
        let response: ChatMessage[];
        if (contextType === 'USER') {
          response = await chatApi.getUserChatMessages(id, pageNum, 50);
        } else if (contextType === 'GROUP') {
          response = await chatApi.getGroupChannelMessages(id, pageNum, 50);
        } else {
          const normalizedChatType = normalizeChatType(effectiveType);
          response = await chatApi.getMessages(contextType, id, pageNum, 50, normalizedChatType);
        }
        if (currentIdRef.current !== requestId) return;
        if (append) {
          setMessages((prev) => {
            const newMessages = [...response, ...prev];
            messagesRef.current = newMessages;
            return newMessages;
          });
        } else {
          messagesRef.current = response;
          setMessages(response);
          scrollToBottom();
          const lastId = response.length > 0 ? response[response.length - 1]?.id : null;
          if (id && lastId) useChatSyncStore.getState().setLastMessageId(contextType, id, lastId);
        }
        setHasMoreMessages(response.length === 50);
        if (!append) {
          setIsLoadingMessages(false);
          const delay = isEmbedded ? 100 : 500;
          setTimeout(() => {
            if (currentIdRef.current === requestId) setIsInitialLoad(false);
          }, delay);
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
        if (!append) {
          setIsLoadingMessages(false);
          setIsInitialLoad(false);
        }
      }
    },
    [id, contextType, currentChatType, isEmbedded, scrollToBottom, currentIdRef]
  );

  const loadMoreMessages = useCallback(async () => {
    if (!hasMoreMessages || isLoadingMore) return;
    setIsLoadingMore(true);
    justLoadedOlderMessagesRef.current = true;
    const nextPage = page + 1;
    await loadMessages(nextPage, true);
    setPage(nextPage);
    setIsLoadingMore(false);
    setTimeout(() => {
      justLoadedOlderMessagesRef.current = false;
    }, 500);
  }, [hasMoreMessages, isLoadingMore, page, loadMessages]);

  const loadMessagesBeforeMessageId = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!id) return false;
      let cursor: string | undefined = messageId;
      const maxIterations = 20;
      for (let i = 0; i < maxIterations; i++) {
        const batch = await chatApi.getMessages(contextType, id, 1, 50, effectiveChatType, cursor);
        if (batch.length > 0) {
          setMessages((prev) => {
            const next = [...batch, ...prev];
            messagesRef.current = next;
            return next;
          });
          if (batch.some((m) => m.id === messageId)) return true;
          if (batch.length < 50) return false;
          cursor = batch[0].id;
        } else {
          return false;
        }
      }
      return false;
    },
    [id, contextType, effectiveChatType]
  );

  return {
    messages,
    setMessages,
    messagesRef,
    page,
    setPage,
    hasMoreMessages,
    setHasMoreMessages,
    isLoadingMessages,
    setIsLoadingMessages,
    isInitialLoad,
    setIsInitialLoad,
    isLoadingMore,
    isSwitchingChatType,
    setIsSwitchingChatType,
    justLoadedOlderMessagesRef,
    loadingIdRef,
    hasLoadedRef,
    isLoadingRef,
    scrollToBottom,
    loadMessages,
    loadMoreMessages,
    loadMessagesBeforeMessageId,
  };
}
