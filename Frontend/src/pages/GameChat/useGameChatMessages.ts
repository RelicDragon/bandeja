import { useState, useCallback, useRef, useLayoutEffect, useMemo, useEffect } from 'react';
import { chatApi, type ChatMessage, type ChatMessageWithStatus } from '@/api/chat';
import {
  applyThreadEvent,
  applyThreadL1Put,
  loadLocalMessagesOlderThan,
  persistChatMessagesFromApi,
} from '@/services/chat/chatLocalApply';
import {
  beginThreadOpenSettling as beginThreadOpenSettlingModule,
  commitThreadOpenPaint as commitThreadOpenPaintModule,
  endThreadOpenSettling as endThreadOpenSettlingModule,
  getThreadOpenPaintGeneration,
  openThread,
  reconcileAfterPaint,
  resetThreadOpenPaint,
  resolveThreadOpenScrollPlan,
  type ThreadOpenOutboxContext,
} from '@/services/chat/threadOpen';
import { mergeMissedIntoWarmRef, takeMissedMessagesForOpen } from '@/services/chat/chatOpenMissedFlush';
import { peekChatFreshOpenNonce, consumeChatFreshOpenNonce } from '@/services/chat/chatOpenEntry';
import { useThreadSnapshotRevision } from './useThreadSnapshotRevision';
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
  deleteChatThreadMemory,
  flushChatThreadL1DebouncedPut,
  peekChatThreadMemory,
} from '@/services/chat/chatThreadMemoryCache';
import type { ThreadScrollRow } from '@/services/chat/chatThreadScroll';
import {
  commitChatOpenMessages,
  createTracedSetMessages,
  type ChatOpenSetMessagesSource,
} from '@/services/chat/chatOpenTrace';
import {
  loadOpenScrollState,
  type OpenThreadPlan,
  type ThreadInitialScroll,
} from '@/services/chat/chatOpenCoordinator';
import {
  planLayoutSeed,
  planThreadTeardown,
  resolveThreadKey,
  shouldForceFreshOpen,
} from '@/services/chat/threadSession';
import {
  chatOpenLikelyHasOlderMessages,
  chatOpenMessageIdsEqual,
  mergeOpenPaintWithLivePending,
} from '@/services/chat/chatOpenSnapshot';
import { decideReconcilePinApply } from '@/services/chat/threadScrollPolicy';
const PAGE_SIZE = 50;

export interface UseGameChatMessagesParams {
  id: string | undefined;
  contextType: ChatContextType;
  currentChatType: ChatType;
  effectiveChatType: ChatType;
  chatContainerRef: RefObject<HTMLDivElement | null>;
  messageListRef: RefObject<MessageListHandle | null>;
  currentIdRef: RefObject<string | undefined>;
  /** `location.state.forceReload` or push fresh-open nonce — re-run bootstrap for same thread key. */
  freshOpenSignal?: number;
  /** Push/deep-link: scroll to this message after open paint when present in snapshot. */
  openAnchorMessageId?: string;
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
  freshOpenSignal = 0,
  openAnchorMessageId,
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
  const forceFreshOpenRef = useRef(false);
  const threadOpenSettlingRef = useRef(true);
  const [isThreadOpenSettling, setIsThreadOpenSettling] = useState(true);
  const [initialScroll, setInitialScroll] = useState<ThreadInitialScroll | undefined>(undefined);
  const [openPaintGeneration, setOpenPaintGeneration] = useState(0);
  const snapshotRevision = useThreadSnapshotRevision(contextType, id);
  const lastConsumedSnapshotRevisionRef = useRef(0);

  const beginThreadOpenSettling = useCallback(() => {
    beginThreadOpenSettlingModule();
    threadOpenSettlingRef.current = true;
    setIsThreadOpenSettling(true);
  }, []);

  const endThreadOpenSettling = useCallback(() => {
    endThreadOpenSettlingModule();
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
      source: ChatOpenSetMessagesSource = 'bootstrap-snapshot',
      scrollOverride?: Pick<OpenThreadPlan, 'scroll' | 'scrollRow'>
    ) => {
      const scrollPlan = scrollOverride ?? plan;
      const paintMessages = mergeOpenPaintWithLivePending(messagesRef.current, plan.messages);
      const duplicatePaint =
        openPaintCommittedRef.current &&
        openScrollThreadKeyRef.current === threadKey &&
        chatOpenMessageIdsEqual(messagesRef.current, paintMessages);
      if (duplicatePaint) {
        commitChatOpenMessages(messagesRef, setMessages, paintMessages, source);
        setHasMoreMessages(chatOpenLikelyHasOlderMessages(paintMessages.length, PAGE_SIZE));
        setIsLoadingMessages(false);
        setIsInitialLoad(false);
        return;
      }
      applyOpenScrollFromPlan(scrollPlan, threadKey);
      commitChatOpenMessages(messagesRef, setMessages, paintMessages, source);
      openPaintCommittedRef.current = true;
      setOpenPaintGeneration(commitThreadOpenPaintModule(threadKey, scrollPlan.scrollRow));
      setHasMoreMessages(chatOpenLikelyHasOlderMessages(paintMessages.length, PAGE_SIZE));
      setPage(1);
      setIsLoadingMessages(false);
      setIsInitialLoad(false);
      if (id) {
        void applyThreadEvent({ kind: 'syncTailsFromHeads', contextType, contextId: id });
      }
      useChatSyncStore.getState().setLastThreadPaint('dexie');
      if (id) {
        void applyThreadL1Put({
          contextType,
          contextId: id,
          gameChatType: contextType === 'GAME' ? effectiveChatType : undefined,
          readRows: () => messagesRef.current,
          verify: () => currentIdRef.current === id,
          immediate: true,
        });
        void applyThreadL1Put({
          contextType,
          contextId: id,
          gameChatType: contextType === 'GAME' ? effectiveChatType : undefined,
          readRows: () => messagesRef.current,
          verify: () => currentIdRef.current === id,
          debounceMs: 800,
        });
      }
    },
    [applyOpenScrollFromPlan, contextType, effectiveChatType, id, currentIdRef, setHasMoreMessages, setPage, setIsLoadingMessages, setIsInitialLoad]
  );

  const paintScrollFor = useCallback(
    (
      messages: readonly ChatMessageWithStatus[],
      scrollRow?: ThreadScrollRow
    ): Pick<OpenThreadPlan, 'scroll' | 'scrollRow'> =>
      resolveThreadOpenScrollPlan({
        messages,
        storedScroll: scrollRow,
        forceFreshOpen: forceFreshOpenRef.current,
        openAnchorMessageId,
      }),
    [openAnchorMessageId]
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

  const applyThreadTeardown = useCallback(() => {
    const plan = planThreadTeardown();
    seededThreadKeyRef.current = plan.seededThreadKey;
    hasLoadedRef.current = plan.hasLoaded;
    openPaintCommittedRef.current = plan.openPaintCommitted;
    openScrollReadyKeyRef.current = plan.openScrollReadyKey;
    loadingIdRef.current = plan.loadingId;
    isLoadingRef.current = plan.isLoading;
    setInitialScroll(undefined);
    endThreadOpenSettlingModule();
  }, []);

  const teardownForChatTypeSwitch = useCallback(() => {
    applyThreadTeardown();
    setMessagesTagged('thread-reset', []);
    messagesRef.current = [];
    beginThreadOpenSettling();
    setIsLoadingMessages(true);
    setIsInitialLoad(true);
    setPage(1);
    setHasMoreMessages(false);
  }, [
    applyThreadTeardown,
    setMessagesTagged,
    beginThreadOpenSettling,
    setIsLoadingMessages,
    setIsInitialLoad,
    setPage,
    setHasMoreMessages,
  ]);

  const commitChatTypeSwitchPaint = useCallback(
    (merged: ChatMessageWithStatus[], targetChatType: ChatType) => {
      if (!id) return;
      const threadKey = resolveThreadKey(
        contextType,
        id,
        contextType === 'GAME' ? targetChatType : undefined
      );
      if (!threadKey) return;
      const scrollPlan = paintScrollFor(merged, undefined);
      commitOpenThreadPaint(
        { messages: merged, scroll: scrollPlan.scroll, scrollRow: scrollPlan.scrollRow },
        threadKey,
        'chat-type-switch',
        scrollPlan
      );
    },
    [id, contextType, paintScrollFor, commitOpenThreadPaint]
  );

  /** ThreadSession layout seed: warm L1 in messagesRef; first visible paint is bootstrap commit. */
  useLayoutEffect(() => {
    const pushFreshNonce = peekChatFreshOpenNonce();
    const forceFreshOpen = shouldForceFreshOpen(freshOpenSignal, pushFreshNonce);
    forceFreshOpenRef.current = forceFreshOpen;
    if (pushFreshNonce > 0) consumeChatFreshOpenNonce(pushFreshNonce);

    const key = resolveThreadKey(
      contextType,
      id,
      contextType === 'GAME' ? effectiveChatType : undefined
    );
    const previousKey = seededThreadKeyRef.current;

    if (!key) {
      applyThreadTeardown();
      setMessagesTagged('thread-reset', []);
      messagesRef.current = [];
      setIsLoadingMessages(true);
      setIsInitialLoad(true);
      beginThreadOpenSettling();
      setPage(1);
      setHasMoreMessages(false);
      return () => {};
    }

    let warmCache = peekChatThreadMemory(key);
    if (id) {
      const tabMissed = takeMissedMessagesForOpen(
        contextType,
        id,
        contextType === 'GAME' ? effectiveChatType : undefined
      );
      if (tabMissed.length > 0) {
        void persistChatMessagesFromApi(tabMissed).catch(() => {});
        warmCache = mergeMissedIntoWarmRef(warmCache, tabMissed) as ChatMessageWithStatus[];
      }
    }

    const seedPlan = planLayoutSeed({
      threadKey: key,
      previousThreadKey: previousKey,
      seededThreadKey: seededThreadKeyRef.current,
      forceFreshOpen,
      warmCache,
    });

    if (!seedPlan.clearVisible) {
      return;
    }

    let warmRef = seedPlan.warmRefMessages;
    if (seedPlan.deleteWarmCache) {
      deleteChatThreadMemory(key);
      warmRef = [];
    }

    seededThreadKeyRef.current = key;
    hasLoadedRef.current = false;
    resetThreadOpenPaint(key);
    beginThreadOpenSettling();
    openScrollReadyKeyRef.current = null;
    openPaintCommittedRef.current = false;
    setInitialScroll(undefined);
    messagesRef.current = warmRef;
    setMessagesTagged('thread-reset', []);
    setIsLoadingMessages(true);
    setIsInitialLoad(true);
    setPage(1);
    setHasMoreMessages(false);

    const flushKey = seedPlan.flushOnUnmountKey ?? key;
    return () => {
      if (seededThreadKeyRef.current === key) {
        flushChatThreadL1DebouncedPut(flushKey, () => messagesRef.current, () => true);
        seededThreadKeyRef.current = null;
      }
    };
  }, [
    id,
    contextType,
    effectiveChatType,
    freshOpenSignal,
    setMessagesTagged,
    setPage,
    setIsLoadingMessages,
    setIsInitialLoad,
    beginThreadOpenSettling,
    applyThreadTeardown,
  ]);

  const scrollToBottom = useCallback(() => {
    try {
      messageListRef.current?.scrollToBottomAlign();
    } catch {
      /* virtualizer not ready */
    }
  }, [messageListRef]);

  const pinAfterSocketMergeIfAllowed = useCallback(() => {
    if (threadOpenSettlingRef.current) return;
    if (!openPaintCommittedRef.current) return;
    const decision = decideReconcilePinApply({
      savedScroll: openScrollRef.current,
      reconcileDelta: 'append',
    });
    if (decision.kind !== 'pin-bottom') return;
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    if (!id || snapshotRevision <= lastConsumedSnapshotRevisionRef.current) return;
    lastConsumedSnapshotRevisionRef.current = snapshotRevision;
    if (!openPaintCommittedRef.current || threadOpenSettlingRef.current) return;
    const threadKey = chatSyncTailKey(
      contextType,
      id,
      contextType === 'GAME' ? effectiveChatType : undefined
    );
    void reconcileAfterPaint({
      threadKey,
      paintGeneration: getThreadOpenPaintGeneration(threadKey),
      contextType,
      contextId: id,
      gameChatType: effectiveChatType,
      currentIdRef,
      messagesRef,
      setMessages,
      scrollRow: openScrollRef.current,
    }).then((result) => {
      if (currentIdRef.current !== id) return;
      if (result.pinToBottom) scrollToBottom();
    });
  }, [
    snapshotRevision,
    id,
    contextType,
    effectiveChatType,
    currentIdRef,
    messagesRef,
    setMessages,
    scrollToBottom,
  ]);

  const reconcileThreadOpenAndPinIfAtBottom = useCallback(
    async (requestId: string, effectiveType: ChatType, threadKey: string) => {
      if (currentIdRef.current !== requestId) return;
      const result = await reconcileAfterPaint({
        threadKey,
        paintGeneration: getThreadOpenPaintGeneration(threadKey),
        contextType,
        contextId: requestId,
        gameChatType: effectiveType,
        currentIdRef,
        messagesRef,
        setMessages,
        scrollRow: openScrollRef.current,
      });
      if (currentIdRef.current !== requestId) return;
      endThreadOpenSettling();
      if (result.pinToBottom) scrollToBottom();
    },
    [contextType, currentIdRef, endThreadOpenSettling, scrollToBottom]
  );

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
            void applyThreadL1Put({
              contextType,
              contextId: requestId,
              gameChatType: contextType === 'GAME' ? effectiveType : undefined,
              readRows: () => messagesRef.current,
              verify: () => currentIdRef.current === requestId,
            });
          }
        } else {
          const lastId = tailMessageId(response);
          if (id && lastId) {
            void applyThreadEvent({
              kind: 'uiTailAdvance',
              contextType,
              contextId: id,
              messageId: lastId,
              gameChatType: contextType === 'GAME' ? effectiveType : undefined,
            });
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
          const scrollPlan = paintScrollFor(merged, scrollRow);
          commitOpenThreadPaint(
            {
              messages: merged,
              scroll: scrollPlan.scroll,
              scrollRow: scrollPlan.scrollRow,
            },
            memKeyNet,
            'network-page'
          );
          useChatSyncStore.getState().setLastThreadPaint('network');
          await reconcileThreadOpenAndPinIfAtBottom(requestId, effectiveType, memKeyNet);
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
    [id, contextType, currentChatType, currentIdRef, fetchMessagesPage, reconcileThreadOpenAndPinIfAtBottom, setMessagesTagged, commitOpenThreadPaint, endThreadOpenSettling, paintScrollFor]
  );

  const bootstrapThread = useCallback(
    async (gameChatType?: ChatType, outbox?: ThreadOpenOutboxContext): Promise<boolean> => {
      if (!id) return false;
      const requestId = id;
      const effectiveType = gameChatType ?? currentChatType;
      const memKey = chatSyncTailKey(
        contextType,
        requestId,
        contextType === 'GAME' ? effectiveType : undefined
      );
      try {
        const outcome = await openThread({
          contextType,
          contextId: requestId,
          chatType: effectiveType,
          threadKey: memKey,
          prev: messagesRef.current,
          peekL1: () => peekChatThreadMemory(memKey),
          peekPrev: () => messagesRef.current,
          outbox,
          forceFreshOpen: forceFreshOpenRef.current,
          openAnchorMessageId,
        });
        if (currentIdRef.current !== requestId) return false;

        messagesRef.current = outcome.mergedPrev;

        if (outcome.kind === 'painted') {
          commitOpenThreadPaint(
            outcome.result.plan,
            memKey,
            outcome.result.setMessagesSource,
            outcome.result.scrollPlan
          );
          await reconcileThreadOpenAndPinIfAtBottom(requestId, effectiveType, memKey);
          return true;
        }

        pendingHistoryBackfillRef.current = true;
        return loadMessages(false, gameChatType);
      } catch (e) {
        console.error('bootstrapThread:', e);
        pendingHistoryBackfillRef.current = true;
        return loadMessages(false, gameChatType);
      }
    },
    [id, contextType, currentChatType, currentIdRef, loadMessages, reconcileThreadOpenAndPinIfAtBottom, commitOpenThreadPaint, openAnchorMessageId]
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
        void applyThreadL1Put({
          contextType,
          contextId: id,
          gameChatType: contextType === 'GAME' ? effectiveChatType : undefined,
          readRows: () => messagesRef.current,
          verify: () => currentIdRef.current === id,
        });
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
      void applyThreadL1Put({
        contextType,
        contextId: id,
        gameChatType: contextType === 'GAME' ? effectiveChatType : undefined,
        readRows: () => messagesRef.current,
        verify: () => currentIdRef.current === id,
      });
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
      const mk = chatSyncTailKey(contextType, id, contextType === 'GAME' ? effectiveChatType : undefined);
      await reconcileAfterPaint({
        threadKey: mk,
        contextType,
        contextId: id,
        gameChatType: effectiveChatType,
        currentIdRef,
        messagesRef,
        setMessages,
      });
      if (currentIdRef.current === id) {
        void applyThreadL1Put({
          contextType,
          contextId: id,
          gameChatType: contextType === 'GAME' ? effectiveChatType : undefined,
          readRows: () => messagesRef.current,
          verify: () => currentIdRef.current === id,
        });
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
    teardownForChatTypeSwitch,
    commitChatTypeSwitchPaint,
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
