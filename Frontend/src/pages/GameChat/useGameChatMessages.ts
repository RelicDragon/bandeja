import { useState, useCallback, useRef } from 'react';
import { chatApi, type ChatMessage, type ChatMessageWithStatus } from '@/api/chat';
import {
  loadLocalMessagesForThread,
  loadLocalMessagesOlderThan,
  loadLocalThreadBootstrap,
  persistChatMessagesFromApi,
} from '@/services/chat/chatLocalApply';
import { reconcileChatThreadOpen } from '@/services/chat/chatOpenReconcile';
import { hydrateLastMessageIdFromDexieIfMissing } from '@/services/chat/messageContextHead';
import { backfillChatHistoryPages } from '@/services/chat/chatHistoryBackfill';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { normalizeChatType } from '@/utils/chatType';
import { scrollChatToBottom } from '@/utils/chatScrollHelpers';
import type { MessageListHandle } from '@/components/MessageList';
import { mergeChatMessagesAscending, mergeServerPageWithPendingOptimistics } from '@/utils/chatMessageSort';
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import type { RefObject } from 'react';

const PAGE_SIZE = 50;

export interface UseGameChatMessagesParams {
  id: string | undefined;
  contextType: ChatContextType;
  currentChatType: ChatType;
  effectiveChatType: ChatType;
  chatContainerRef: RefObject<HTMLDivElement | null>;
  messageListRef: RefObject<MessageListHandle | null>;
  currentIdRef: RefObject<string | undefined>;
}

function tailMessageId(messages: ChatMessage[]): string | null {
  if (messages.length === 0) return null;
  return messages[messages.length - 1]!.id;
}

export function useGameChatMessages({
  id,
  contextType,
  currentChatType,
  effectiveChatType,
  chatContainerRef,
  messageListRef,
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
  const pendingHistoryBackfillRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    const list = messageListRef.current;
    if (list) {
      list.scrollToBottomAlign();
      return;
    }
    scrollChatToBottom(chatContainerRef);
  }, [chatContainerRef, messageListRef]);

  const fetchMessagesPage = useCallback(
    async (
      opts: { append: false; chatTypeOverride?: ChatType } | { append: true; oldestMessageId: string; chatTypeOverride?: ChatType }
    ): Promise<ChatMessage[]> => {
      if (!id) return [];
      const effectiveType = opts.chatTypeOverride ?? currentChatType;
      if (contextType === 'USER') {
        if (opts.append) {
          return chatApi.getUserChatMessages(id, 1, PAGE_SIZE, opts.oldestMessageId);
        }
        return chatApi.getUserChatMessages(id, 1, PAGE_SIZE);
      }
      if (contextType === 'GROUP') {
        if (opts.append) {
          return chatApi.getGroupChannelMessages(id, 1, PAGE_SIZE, opts.oldestMessageId);
        }
        return chatApi.getGroupChannelMessages(id, 1, PAGE_SIZE);
      }
      if (contextType === 'BUG') {
        if (opts.append) {
          return chatApi.getBugMessages(id, 1, PAGE_SIZE, opts.oldestMessageId);
        }
        return chatApi.getBugMessages(id, 1, PAGE_SIZE);
      }
      const normalizedChatType = normalizeChatType(effectiveType);
      if (opts.append) {
        return chatApi.getMessages(contextType, id, 1, PAGE_SIZE, normalizedChatType, opts.oldestMessageId);
      }
      return chatApi.getMessages(contextType, id, 1, PAGE_SIZE, normalizedChatType);
    },
    [id, contextType, currentChatType]
  );

  const loadMessages = useCallback(
    async (append = false, chatTypeOverride?: ChatType): Promise<boolean> => {
      if (!id) return false;
      const requestId = id;
      const effectiveType = chatTypeOverride ?? currentChatType;
      try {
        if (!append) {
          setIsLoadingMessages(true);
          setIsInitialLoad(true);
        }
        let response: ChatMessage[];
        if (append) {
          const oldest = messagesRef.current[0];
          if (!oldest) return false;
          response = await fetchMessagesPage({
            append: true,
            oldestMessageId: oldest.id,
            chatTypeOverride: effectiveType,
          });
        } else {
          response = await fetchMessagesPage({ append: false, chatTypeOverride: effectiveType });
        }
        if (currentIdRef.current !== requestId) return false;
        if (append) {
          setMessages((prev) => {
            const newMessages = mergeChatMessagesAscending(response, prev);
            messagesRef.current = newMessages;
            return newMessages;
          });
        } else {
          setMessages((prev) => {
            const merged = mergeServerPageWithPendingOptimistics(prev, response);
            messagesRef.current = merged;
            return merged;
          });
          const lastId = tailMessageId(response);
          if (id && lastId) {
            useChatSyncStore
              .getState()
              .setLastMessageId(
                contextType,
                id,
                lastId,
                contextType === 'GAME' ? effectiveType : undefined
              );
          }
        }
        setHasMoreMessages(response.length === PAGE_SIZE);
        void persistChatMessagesFromApi(response).catch(() => {});
        if (!append && currentIdRef.current === requestId) {
          useChatSyncStore.getState().setLastThreadPaint('network');
          await reconcileChatThreadOpen({
            contextType,
            contextId: requestId,
            gameChatType: effectiveType,
            currentIdRef,
            messagesRef,
            setMessages,
          });
          const shouldBackfill = pendingHistoryBackfillRef.current;
          pendingHistoryBackfillRef.current = false;
          if (shouldBackfill && response.length === PAGE_SIZE) {
            const oldest = messagesRef.current[0];
            if (oldest && currentIdRef.current === requestId) {
              void backfillChatHistoryPages(contextType, requestId, effectiveType, oldest.id).catch(() => {});
            }
          }
        }
        if (!append) {
          setIsLoadingMessages(false);
          if (currentIdRef.current === requestId) setIsInitialLoad(false);
        }
        return true;
      } catch (error) {
        console.error('Failed to load messages:', error);
        if (!append) {
          pendingHistoryBackfillRef.current = false;
          setIsLoadingMessages(false);
          setIsInitialLoad(false);
        }
        return false;
      }
    },
    [id, contextType, currentChatType, currentIdRef, fetchMessagesPage]
  );

  const bootstrapThread = useCallback(
    async (gameChatType?: ChatType): Promise<boolean> => {
      if (!id) return false;
      const requestId = id;
      const effectiveType = gameChatType ?? currentChatType;
      const runBackgroundReconcile = () => {
        void reconcileChatThreadOpen({
          contextType,
          contextId: requestId,
          gameChatType: effectiveType,
          currentIdRef,
          messagesRef,
          setMessages,
        });
      };

      const paintFromDexie = (localMsgs: ChatMessage[]) => {
        setMessages((prev) => {
          const merged = mergeServerPageWithPendingOptimistics(prev, localMsgs);
          messagesRef.current = merged;
          return merged;
        });
        setHasMoreMessages(true);
        setPage(1);
        setIsLoadingMessages(false);
        if (currentIdRef.current === requestId) setIsInitialLoad(false);
        const lid = tailMessageId(localMsgs);
        if (lid) {
          useChatSyncStore
            .getState()
            .setLastMessageId(contextType, requestId, lid, contextType === 'GAME' ? effectiveType : undefined);
        }
        useChatSyncStore.getState().setLastThreadPaint('dexie');
      };

      try {
        const { messages: local } = await loadLocalThreadBootstrap(
          contextType,
          requestId,
          effectiveType,
          (tail) => {
            if (currentIdRef.current !== requestId || tail.length === 0) return;
            paintFromDexie(tail);
          }
        );
        if (currentIdRef.current !== requestId) return false;

        if (local.length > 0) {
          paintFromDexie(local);
          runBackgroundReconcile();
          return true;
        }

        await hydrateLastMessageIdFromDexieIfMissing(
          contextType,
          requestId,
          contextType === 'GAME' ? effectiveType : undefined
        );
        if (currentIdRef.current !== requestId) return false;

        const lastId = useChatSyncStore
          .getState()
          .getLastMessageId(contextType, requestId, contextType === 'GAME' ? effectiveType : undefined);
        if (lastId) {
          await reconcileChatThreadOpen({
            contextType,
            contextId: requestId,
            gameChatType: effectiveType,
            currentIdRef,
            messagesRef,
            setMessages,
          });
          if (currentIdRef.current !== requestId) return false;
          const afterSync = await loadLocalMessagesForThread(contextType, requestId, effectiveType);
          if (afterSync.length > 0) {
            paintFromDexie(afterSync);
            return true;
          }
        }

        pendingHistoryBackfillRef.current = true;
        return loadMessages(false, gameChatType);
      } catch (e) {
        console.error('bootstrapThread:', e);
        pendingHistoryBackfillRef.current = true;
        return loadMessages(false, gameChatType);
      }
    },
    [id, contextType, currentChatType, currentIdRef, loadMessages]
  );

  const loadMoreMessages = useCallback(async () => {
    if (!hasMoreMessages || isLoadingMore || !id) return;
    setIsLoadingMore(true);
    justLoadedOlderMessagesRef.current = true;
    try {
      const oldest = messagesRef.current[0];
      if (!oldest) {
        setHasMoreMessages(false);
        return;
      }
      const olderLocal = await loadLocalMessagesOlderThan(
        contextType,
        id,
        effectiveChatType,
        oldest,
        PAGE_SIZE
      );
      if (currentIdRef.current !== id) return;

      if (olderLocal.length > 0) {
        void persistChatMessagesFromApi(olderLocal).catch(() => {});
        setMessages((prev) => {
          const merged = mergeChatMessagesAscending(olderLocal, prev);
          messagesRef.current = merged;
          return merged;
        });
        setHasMoreMessages(true);
        return;
      }

      const response = await fetchMessagesPage({
        append: true,
        oldestMessageId: oldest.id,
        chatTypeOverride: currentChatType,
      });
      if (currentIdRef.current !== id) return;
      void persistChatMessagesFromApi(response).catch(() => {});
      setMessages((prev) => {
        const merged = mergeChatMessagesAscending(response, prev);
        messagesRef.current = merged;
        return merged;
      });
      setHasMoreMessages(response.length === PAGE_SIZE);
    } catch (error) {
      console.error('Failed to load more messages:', error);
    } finally {
      setIsLoadingMore(false);
      setTimeout(() => {
        justLoadedOlderMessagesRef.current = false;
      }, 500);
    }
  }, [hasMoreMessages, isLoadingMore, id, contextType, effectiveChatType, currentChatType, currentIdRef, fetchMessagesPage]);

  const loadMessagesBeforeMessageId = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!id) return false;
      let anchor: ChatMessage;
      try {
        anchor = await chatApi.getChatMessageById(messageId);
      } catch {
        return false;
      }
      if (anchor.chatContextType !== contextType || anchor.contextId !== id) return false;
      if (
        contextType === 'GAME' &&
        normalizeChatType(anchor.chatType as ChatType) !== normalizeChatType(effectiveChatType)
      ) {
        return false;
      }

      let acc = mergeChatMessagesAscending(messagesRef.current, [anchor]);
      messagesRef.current = acc;
      setMessages(acc);
      void persistChatMessagesFromApi([anchor]).catch(() => {});

      let cursor = messageId;
      for (let i = 0; i < 20; i++) {
        const batch = await chatApi.getMessages(contextType, id, 1, PAGE_SIZE, effectiveChatType, cursor);
        if (batch.length === 0) break;
        void persistChatMessagesFromApi(batch).catch(() => {});
        acc = mergeChatMessagesAscending(acc, batch);
        messagesRef.current = acc;
        setMessages(acc);
        if (batch.length < PAGE_SIZE) break;
        cursor = batch[0].id;
      }

      if (currentIdRef.current !== id) return acc.some((m) => m.id === messageId);
      await reconcileChatThreadOpen({
        contextType,
        contextId: id,
        gameChatType: effectiveChatType,
        currentIdRef,
        messagesRef,
        setMessages,
      });
      return messagesRef.current.some((m) => m.id === messageId);
    },
    [id, contextType, effectiveChatType, currentIdRef, messagesRef, setMessages]
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
    bootstrapThread,
  };
}
