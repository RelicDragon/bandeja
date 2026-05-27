import { useState, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { chatApi, type ChatMessage, type ChatMessageWithStatus } from '@/api/chat';
import {
  loadLocalMessagesOlderThan,
  loadLocalThreadBootstrap,
  persistChatMessagesFromApi,
} from '@/services/chat/chatLocalApply';
import { reconcileChatThreadOpen, takeAllGameTabMissedMessages } from '@/services/chat/chatOpenReconcile';
import { hydrateLastMessageIdFromDexieIfMissing } from '@/services/chat/messageContextHead';
import { backfillChatHistoryPages } from '@/services/chat/chatHistoryBackfill';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { normalizeChatType } from '@/utils/chatType';
import type { MessageListHandle } from '@/components/MessageList';
import { mergeChatMessagesAscending, mergeServerPageWithPendingOptimistics } from '@/utils/chatMessageSort';
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import type { RefObject } from 'react';
import type React from 'react';
import { chatSyncTailKey } from '@/utils/chatSyncScope';
import {
  flushChatThreadL1DebouncedPut,
  peekChatThreadMemory,
  putChatThreadMemory,
  scheduleChatThreadL1DebouncedPut,
} from '@/services/chat/chatThreadMemoryCache';
import type { ThreadScrollRow } from '@/services/chat/chatThreadScroll';
import {
  commitChatOpenMessages,
  createTracedSetMessages,
  type ChatOpenSetMessagesSource,
} from '@/services/chat/chatOpenTrace';
import {
  loadOpenScrollState,
  openThreadBootstrap,
  type OpenThreadPlan,
  type ThreadInitialScroll,
} from '@/services/chat/chatOpenCoordinator';
import {
  chatOpenLikelyHasOlderMessages,
  chatOpenMessageIdsEqual,
} from '@/services/chat/chatOpenSnapshot';
import { buildOutboxOptimisticsForOpen } from '@/services/chat/chatOutboxOpenSnapshot';
import type { BasicUser } from '@/types';

const PAGE_SIZE = 50;

export type BootstrapOutboxContext = {
  userId: string;
  user: BasicUser | null;
};

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
  chatContainerRef: _chatContainerRef,
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
  const seededThreadKeyRef = useRef<string | null>(null);
  const openScrollRef = useRef<ThreadScrollRow | undefined>(undefined);
  const openScrollThreadKeyRef = useRef<string | null>(null);
  const openScrollReadyKeyRef = useRef<string | null>(null);
  const openPaintCommittedRef = useRef(false);
  const threadOpenSettlingRef = useRef(true);
  const [isThreadOpenSettling, setIsThreadOpenSettling] = useState(true);
  const [initialScroll, setInitialScroll] = useState<ThreadInitialScroll | undefined>(undefined);
  const [openPaintGeneration, setOpenPaintGeneration] = useState(0);

  const beginThreadOpenSettling = useCallback(() => {
    threadOpenSettlingRef.current = true;
    setIsThreadOpenSettling(true);
  }, []);

  const endThreadOpenSettling = useCallback(() => {
    threadOpenSettlingRef.current = false;
    setIsThreadOpenSettling(false);
  }, []);

  const applyOpenScrollFromPlan = useCallback((plan: Pick<OpenThreadPlan, 'scroll' | 'scrollRow'>, threadKey: string) => {
    openScrollThreadKeyRef.current = threadKey;
    openScrollReadyKeyRef.current = threadKey;
    openScrollRef.current = plan.scrollRow;
    setInitialScroll(
      'anchorMessageId' in plan.scroll
        ? { anchorMessageId: plan.scroll.anchorMessageId }
        : { atBottom: true }
    );
  }, []);

  const commitOpenThreadPaint = useCallback(
    (
      plan: Pick<OpenThreadPlan, 'messages' | 'scroll' | 'scrollRow'>,
      threadKey: string,
      source: ChatOpenSetMessagesSource = 'bootstrap-snapshot'
    ) => {
      const duplicatePaint =
        openPaintCommittedRef.current &&
        openScrollThreadKeyRef.current === threadKey &&
        chatOpenMessageIdsEqual(messagesRef.current, plan.messages);
      if (duplicatePaint) {
        setHasMoreMessages(chatOpenLikelyHasOlderMessages(plan.messages.length, PAGE_SIZE));
        setIsLoadingMessages(false);
        setIsInitialLoad(false);
        return;
      }
      applyOpenScrollFromPlan(plan, threadKey);
      commitChatOpenMessages(messagesRef, setMessages, plan.messages, source);
      openPaintCommittedRef.current = true;
      setOpenPaintGeneration((g) => g + 1);
      setHasMoreMessages(chatOpenLikelyHasOlderMessages(plan.messages.length, PAGE_SIZE));
      setPage(1);
      setIsLoadingMessages(false);
      setIsInitialLoad(false);
      const lid = tailMessageId(plan.messages);
      if (lid && id) {
        useChatSyncStore
          .getState()
          .setLastMessageId(
            contextType,
            id,
            lid,
            contextType === 'GAME' ? effectiveChatType : undefined
          );
      }
      useChatSyncStore.getState().setLastThreadPaint('dexie');
      putChatThreadMemory(threadKey, plan.messages, () => currentIdRef.current === id);
      scheduleChatThreadL1DebouncedPut(
        threadKey,
        () => messagesRef.current,
        () => currentIdRef.current === id,
        800
      );
    },
    [applyOpenScrollFromPlan, contextType, id, effectiveChatType, currentIdRef, setHasMoreMessages, setPage, setIsLoadingMessages, setIsInitialLoad]
  );

  const tracedSetMessages = useMemo(
    () => createTracedSetMessages(setMessages, messagesRef),
    [setMessages]
  );
  const setMessagesTagged = useCallback(
    (source: ChatOpenSetMessagesSource, value: React.SetStateAction<ChatMessageWithStatus[]>) => {
      tracedSetMessages(source, value);
    },
    [tracedSetMessages]
  );

  /** A1.3 thread reset: warm L1 in messagesRef only; first visible paint is bootstrap commit. */
  useLayoutEffect(() => {
    const key =
      id != null && id !== ''
        ? chatSyncTailKey(contextType, id, contextType === 'GAME' ? effectiveChatType : undefined)
        : null;

    if (!key) {
      seededThreadKeyRef.current = null;
      setMessagesTagged('thread-reset', []);
      messagesRef.current = [];
      setIsLoadingMessages(true);
      setIsInitialLoad(true);
      beginThreadOpenSettling();
      setPage(1);
      setHasMoreMessages(false);
      return () => {};
    }

    if (key === seededThreadKeyRef.current) {
      return;
    }

    seededThreadKeyRef.current = key;
    hasLoadedRef.current = false;
    beginThreadOpenSettling();
    openScrollReadyKeyRef.current = null;
    openPaintCommittedRef.current = false;
    setInitialScroll(undefined);

    let cached = peekChatThreadMemory(key);
    if (contextType === 'GAME' && id) {
      const tabMissed = takeAllGameTabMissedMessages(id);
      if (tabMissed.length > 0) {
        void persistChatMessagesFromApi(tabMissed).catch(() => {});
        cached =
          cached.length > 0
            ? mergeChatMessagesAscending(cached, tabMissed)
            : (tabMissed as ChatMessageWithStatus[]);
      }
    }
    messagesRef.current = cached;
    setMessagesTagged('thread-reset', []);
    setIsLoadingMessages(true);
    setIsInitialLoad(true);
    setPage(1);
    setHasMoreMessages(false);

    return () => {
      if (seededThreadKeyRef.current === key) {
        flushChatThreadL1DebouncedPut(key, () => messagesRef.current, () => true);
        seededThreadKeyRef.current = null;
      }
    };
  }, [id, contextType, effectiveChatType, setMessagesTagged, setHasMoreMessages, setPage, setIsLoadingMessages, setIsInitialLoad, beginThreadOpenSettling]);

  const scrollToBottom = useCallback(() => {
    try {
      messageListRef.current?.scrollToBottomAlign();
    } catch {
      /* virtualizer not ready */
    }
  }, [messageListRef]);

  const reconcileThreadOpenAndPinIfAtBottom = useCallback(
    async (requestId: string, effectiveType: ChatType) => {
      if (currentIdRef.current !== requestId) return;
      await reconcileChatThreadOpen({
        contextType,
        contextId: requestId,
        gameChatType: effectiveType,
        currentIdRef,
        messagesRef,
        setMessages,
      });
      if (currentIdRef.current !== requestId) return;
      endThreadOpenSettling();
    },
    [contextType, currentIdRef, endThreadOpenSettling]
  );

  const pinAfterSocketMergeIfAllowed = useCallback(() => {
    if (threadOpenSettlingRef.current) return;
    if (!openPaintCommittedRef.current) return;
    const scroll = openScrollRef.current;
    if (scroll?.anchorMessageId) return;
    if (scroll && scroll.atBottom === false) return;
    scrollToBottom();
  }, [scrollToBottom]);

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
          const showFullLoading = messagesRef.current.length === 0;
          if (showFullLoading) {
            setIsLoadingMessages(true);
            setIsInitialLoad(true);
          }
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
          setMessagesTagged('network-append', (prev) => {
            const newMessages = mergeChatMessagesAscending(response, prev);
            messagesRef.current = newMessages;
            return newMessages;
          });
          if (currentIdRef.current === requestId) {
            const memKeyAppend = chatSyncTailKey(
              contextType,
              requestId,
              contextType === 'GAME' ? effectiveType : undefined
            );
            scheduleChatThreadL1DebouncedPut(
              memKeyAppend,
              () => messagesRef.current,
              () => currentIdRef.current === requestId
            );
          }
        } else {
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
          const memKeyNet = chatSyncTailKey(
            contextType,
            requestId,
            contextType === 'GAME' ? effectiveType : undefined
          );
          const merged = mergeServerPageWithPendingOptimistics(messagesRef.current, response);
          const scrollRow = await loadOpenScrollState(memKeyNet);
          if (currentIdRef.current !== requestId) return false;
          commitOpenThreadPaint(
            {
              messages: merged,
              scroll: scrollRow?.anchorMessageId
                ? { anchorMessageId: scrollRow.anchorMessageId }
                : { atBottom: true },
              scrollRow,
            },
            memKeyNet,
            'network-page'
          );
          useChatSyncStore.getState().setLastThreadPaint('network');
          await reconcileThreadOpenAndPinIfAtBottom(requestId, effectiveType);
          const shouldBackfill = pendingHistoryBackfillRef.current;
          pendingHistoryBackfillRef.current = false;
          if (shouldBackfill && response.length === PAGE_SIZE) {
            const oldest = messagesRef.current[0];
            if (oldest && currentIdRef.current === requestId) {
              void backfillChatHistoryPages(contextType, requestId, effectiveType, oldest.id).catch(() => {});
            }
          }
        }
        return true;
      } catch (error) {
        console.error('Failed to load messages:', error);
        if (!append) {
          pendingHistoryBackfillRef.current = false;
          setIsLoadingMessages(false);
          setIsInitialLoad(false);
          endThreadOpenSettling();
        }
        return false;
      }
    },
    [id, contextType, currentChatType, currentIdRef, fetchMessagesPage, reconcileThreadOpenAndPinIfAtBottom, setMessagesTagged, commitOpenThreadPaint, endThreadOpenSettling]
  );

  const bootstrapThread = useCallback(
    async (gameChatType?: ChatType, outbox?: BootstrapOutboxContext): Promise<boolean> => {
      if (!id) return false;
      const requestId = id;
      const effectiveType = gameChatType ?? currentChatType;
      const memKey = chatSyncTailKey(
        contextType,
        requestId,
        contextType === 'GAME' ? effectiveType : undefined
      );
      const bootstrapEmptyFallback = async (): Promise<boolean> => {
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
          const { messages: dexieTail } = await loadLocalThreadBootstrap(
            contextType,
            requestId,
            effectiveType
          );
          if (currentIdRef.current !== requestId) return false;
          if (dexieTail.length > 0) {
            const scrollRow = await loadOpenScrollState(memKey);
            if (currentIdRef.current !== requestId) return false;
            const merged = mergeServerPageWithPendingOptimistics(messagesRef.current, dexieTail);
            commitOpenThreadPaint(
              {
                messages: merged,
                scroll: scrollRow?.anchorMessageId
                  ? { anchorMessageId: scrollRow.anchorMessageId }
                  : { atBottom: true },
                scrollRow,
              },
              memKey
            );
            await reconcileThreadOpenAndPinIfAtBottom(requestId, effectiveType);
            return true;
          }
        }

        pendingHistoryBackfillRef.current = true;
        return loadMessages(false, gameChatType);
      };

      try {
        const result = await openThreadBootstrap({
          threadKey: memKey,
          peekL1: () => peekChatThreadMemory(memKey),
          prev: messagesRef.current,
          loadBootstrap: () =>
            loadLocalThreadBootstrap(contextType, requestId, effectiveType),
          loadOutboxOptimistics: outbox
            ? () =>
                buildOutboxOptimisticsForOpen({
                  contextType,
                  contextId: requestId,
                  currentChatType: effectiveType,
                  userId: outbox.userId,
                  user: outbox.user,
                  existingMessages: messagesRef.current,
                }).then((r) => r.optimistics)
            : undefined,
        });
        if (currentIdRef.current !== requestId) return false;
        if (result.kind === 'painted') {
          commitOpenThreadPaint(result.plan, memKey);
          await reconcileThreadOpenAndPinIfAtBottom(requestId, effectiveType);
          return true;
        }
        return bootstrapEmptyFallback();
      } catch (e) {
        console.error('bootstrapThread:', e);
        pendingHistoryBackfillRef.current = true;
        return loadMessages(false, gameChatType);
      }
    },
    [id, contextType, currentChatType, currentIdRef, loadMessages, reconcileThreadOpenAndPinIfAtBottom, commitOpenThreadPaint]
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
        setMessagesTagged('load-more-local', (prev) => {
          const merged = mergeChatMessagesAscending(olderLocal, prev);
          if (chatOpenMessageIdsEqual(prev, merged)) return prev;
          messagesRef.current = merged;
          return merged;
        });
        setHasMoreMessages(true);
        const memKeyOldest = chatSyncTailKey(
          contextType,
          id,
          contextType === 'GAME' ? effectiveChatType : undefined
        );
        scheduleChatThreadL1DebouncedPut(memKeyOldest, () => messagesRef.current, () => currentIdRef.current === id);
        return;
      }

      const response = await fetchMessagesPage({
        append: true,
        oldestMessageId: oldest.id,
        chatTypeOverride: currentChatType,
      });
      if (currentIdRef.current !== id) return;
      if (response.length === 0) {
        setHasMoreMessages(false);
        return;
      }
      void persistChatMessagesFromApi(response).catch(() => {});
      setMessagesTagged('load-more-network', (prev) => {
        const merged = mergeChatMessagesAscending(response, prev);
        if (chatOpenMessageIdsEqual(prev, merged)) return prev;
        messagesRef.current = merged;
        return merged;
      });
      setHasMoreMessages(response.length === PAGE_SIZE);
      const memKey = chatSyncTailKey(
        contextType,
        id,
        contextType === 'GAME' ? effectiveChatType : undefined
      );
      scheduleChatThreadL1DebouncedPut(memKey, () => messagesRef.current, () => currentIdRef.current === id);
    } catch (error) {
      console.error('Failed to load more messages:', error);
    } finally {
      setIsLoadingMore(false);
      setTimeout(() => {
        justLoadedOlderMessagesRef.current = false;
      }, 500);
    }
  }, [hasMoreMessages, isLoadingMore, id, contextType, effectiveChatType, currentChatType, currentIdRef, fetchMessagesPage, setMessagesTagged]);

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
      setMessagesTagged('anchor-load', acc);
      void persistChatMessagesFromApi([anchor]).catch(() => {});

      let cursor = messageId;
      for (let i = 0; i < 20; i++) {
        const batch = await chatApi.getMessages(contextType, id, 1, PAGE_SIZE, effectiveChatType, cursor);
        if (batch.length === 0) break;
        void persistChatMessagesFromApi(batch).catch(() => {});
        acc = mergeChatMessagesAscending(acc, batch);
        messagesRef.current = acc;
        setMessagesTagged('anchor-load', acc);
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
      if (currentIdRef.current === id) {
        const mk = chatSyncTailKey(contextType, id, contextType === 'GAME' ? effectiveChatType : undefined);
        scheduleChatThreadL1DebouncedPut(mk, () => messagesRef.current, () => currentIdRef.current === id);
      }
      return messagesRef.current.some((m) => m.id === messageId);
    },
    [id, contextType, effectiveChatType, currentIdRef, messagesRef, setMessagesTagged]
  );

  return {
    messages,
    initialScroll,
    openPaintGeneration,
    openPaintCommittedRef,
    pinAfterSocketMergeIfAllowed,
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
    isThreadOpenSettling,
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
