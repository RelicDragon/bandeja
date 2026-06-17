import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
  useReducer,
  memo,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ChatMessage } from '@/api/chat';
import type { ThreadInitialScroll } from '@/services/chat/chatOpenScrollPolicy';
import { MessageListRow } from './MessageList/MessageListRow';
import { messageListPropsEqual } from './MessageList/messageListPropsEqual';
import {
  handleMessageListContextMenuScrollStart,
  resetMessageListContextMenu,
} from './MessageList/messageListContextMenuStore';
import { MessageListSettlingProvider } from './MessageList/MessageListSettlingProvider';
import { useMessageListNewKeys } from './MessageList/useMessageListNewKeys';
import { useMessageListSeenDateSeparators } from './MessageList/useMessageListSeenDateSeparators';
import { useMessageListScrollAnchor } from './MessageList/useMessageListScrollAnchor';
import type { MessageListHandle, MessageListProps } from './MessageList/types';
import {
  flushThreadScrollSave,
  scheduleThreadScrollSave,
} from '@/services/chat/chatThreadScroll';
import {
  END_SPACER_PX,
  registerRowHeightBump,
  rowHeightCacheEstimate,
  rowHeightCacheHasDateSeparator,
  rowHeightCachePreloadTail,
  rowHeightCacheMeasuredChanged,
  rowHeightCacheRecordMeasured,
  rowHeightCacheSeedTailHeuristics,
} from '@/services/chat/rowHeightCache';
import { buildReplyCountMap, findFirstReplyId } from '@/services/chat/replyCountMap';
import {
  decideNewMessagesScrollApply,
  decideOpenScrollApply,
  decideSettlingPinApply,
} from '@/services/chat/threadScrollPolicy';
import {
  isMessageListNearBottom,
  pinMessageListContainerToBottom,
  pinMessageListContainerToBottomAfterLayout,
  scrollVirtualizerToIndex,
} from '@/utils/messageListScroll';
import { getMessageRowKey } from '@/services/chat/messageRowKey';
import { isThreadMessagesPending } from '@/pages/GameChat/threadViewLoadingState';
import { WavyDots } from '@/components/WavyDots';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CHAT_LIST_HEIGHT_TRANSITION,
  CHAT_MESSAGE_ENTER_Y,
  CHAT_PANEL_TRANSITION,
} from '@/components/chat/chatListMotion';
import { useVirtualRowLayoutTransition } from '@/components/chat/useVirtualRowLayoutTransition';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { applyScrollTargetMessageHighlight } from '@/utils/scrollTargetMessageHighlight';
import { getChatDateSeparatorLabel } from '@/utils/chatDateSeparator';

const OPEN_TAIL_EAGER_MEDIA = 60;
/** Fixed overscan — velocity-based toggling remounted rows and shifted scroll height. */
const VIRTUAL_OVERSCAN = 12;
/** Skip redundant scrollToIndex(end) when already visually pinned (subpixel / end spacer). */
const PIN_BOTTOM_SKIP_GAP_PX = 20;

export type { MessageListHandle, MessageListProps };

const MessageListInner = forwardRef<MessageListHandle, MessageListProps>(function MessageList(
  {
    messages,
    onAddReaction,
    onRemoveReaction,
    onDeleteMessage,
    onReplyMessage,
    onEditMessage,
    onPollUpdated,
    onResendQueued,
    onRemoveFromQueue,
    isLoading = false,
    isLoadingMessages = false,
    isSwitchingChatType = false,
    onScrollToMessage,
    hasMoreMessages = false,
    onLoadMore,
    isInitialLoad = false,
    isLoadingMore = false,
    isChannel = false,
    userChatUser1Id,
    userChatUser2Id,
    onChatRequestRespond,
    hasContextPanel = false,
    pinnedMessageIds = [],
    onPin,
    onUnpin,
    showReply = true,
    onForwardMessage,
    threadScrollKey = null,
    initialScroll = undefined,
    highlightAnchorMessageId,
    openPaintGeneration = 0,
    threadLayoutSettling = false,
    onChatScrollNearBottomChange,
  },
  ref
) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const pinnedSet = useMemo(() => new Set(pinnedMessageIds), [pinnedMessageIds]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const innerListRef = useRef<HTMLDivElement>(null);
  const topLoadSentinelRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);
  const previousFirstMessageIdRef = useRef<string | undefined>(undefined);
  const previousScrollHeightRef = useRef(0);
  const previousScrollTopRef = useRef(0);
  /** Open intent from `initialScroll` — no bottom pin until scroll plan is committed. */
  const openScrollAtBottomRef = useRef(false);
  const isLoadingMoreRef = useRef(false);
  const justLoadedOlderMessagesRef = useRef(false);
  const loadMoreCooldownRef = useRef(0);
  const layoutSettlingRef = useRef(threadLayoutSettling);
  layoutSettlingRef.current = threadLayoutSettling;
  const isInitialLoadRef = useRef(isInitialLoad);
  isInitialLoadRef.current = isInitialLoad;
  const settlingRefs = useMemo(
    () => ({ layoutSettlingRef, isInitialLoadRef }),
    []
  );

  useEffect(() => {
    resetMessageListContextMenu();
  }, [threadScrollKey]);

  const replyCountMap = useMemo(() => buildReplyCountMap(messages), [messages]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const onScrollToFirstReply = useCallback((parentMessageId: string) => {
    const firstId = findFirstReplyId(messagesRef.current, parentMessageId);
    if (firstId) onScrollToMessage?.(firstId);
  }, [onScrollToMessage]);

  const rowCount = messages.length + 1;
  const [, bumpHeightEstimates] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    registerRowHeightBump(bumpHeightEstimates);
    return () => registerRowHeightBump(null);
  }, []);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => messagesContainerRef.current,
    estimateSize: (index) => {
      if (index === rowCount - 1) return END_SPACER_PX;
      return rowHeightCacheEstimate({ message: messages[index], index, messages });
    },
    overscan: VIRTUAL_OVERSCAN,
    getItemKey: (index) =>
      index === rowCount - 1 ? '__end__' : (messages[index] ? getMessageRowKey(messages[index]) : `i-${index}`),
  });

  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => false;

  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  const messagesForScrollRef = useRef(messages);
  messagesForScrollRef.current = messages;

  const scrollToBottomAlign = useCallback(() => {
    pinMessageListContainerToBottomAfterLayout(() => messagesContainerRef.current, 3);
  }, []);

  const scrollToBottomSmooth = useCallback(() => {
    pinMessageListContainerToBottom(messagesContainerRef.current, { behavior: 'smooth' });
  }, []);

  const messagesMeasureRef = useRef(messages);
  messagesMeasureRef.current = messages;

  const virtualItemsSnapshot = virtualizer.getVirtualItems();
  const virtualMeasureKey = virtualItemsSnapshot
    .filter((vi) => vi.index < rowCount - 1)
    .map((vi) => `${vi.index}:${messages[vi.index]?.id ?? ''}:${Math.round(vi.size)}`)
    .join('|');

  const tailIdsForHeightPreload = messages.slice(-140).map((m) => m.id).join('\x1e');

  const eagerMediaMessageIds = useMemo(() => {
    const tail = messages.slice(-OPEN_TAIL_EAGER_MEDIA);
    return new Set(
      tail.filter((m) => (m.mediaUrls?.length ?? 0) > 0 && m.messageType !== 'VIDEO').map((m) => m.id)
    );
  }, [messages]);

  const lastSeededTailKeyRef = useRef('');

  useLayoutEffect(() => {
    if (!threadScrollKey) return;
    lastSeededTailKeyRef.current = '';
    const msgs = messagesMeasureRef.current;
    if (msgs.length > 0 && rowHeightCacheSeedTailHeuristics(msgs, msgs.length)) {
      bumpHeightEstimates();
    }
  }, [threadScrollKey]);

  useLayoutEffect(() => {
    if (tailIdsForHeightPreload.length === 0 || tailIdsForHeightPreload === lastSeededTailKeyRef.current) {
      return;
    }
    lastSeededTailKeyRef.current = tailIdsForHeightPreload;
    if (rowHeightCacheSeedTailHeuristics(messagesMeasureRef.current.slice(-140))) {
      bumpHeightEstimates();
    }
  }, [threadScrollKey, tailIdsForHeightPreload]);

  useEffect(() => {
    if (tailIdsForHeightPreload.length === 0) return;
    void rowHeightCachePreloadTail({
      messages: messagesMeasureRef.current,
      threadKey: threadScrollKey,
      limit: 140,
    });
  }, [threadScrollKey, tailIdsForHeightPreload]);

  const layoutSettlingForBottomPin = threadLayoutSettling;

  const layoutSettlingForBottomPinRef = useRef(layoutSettlingForBottomPin);
  layoutSettlingForBottomPinRef.current = layoutSettlingForBottomPin;

  useLayoutEffect(() => {
    if (initialScroll === undefined) {
      openScrollAtBottomRef.current = false;
      return;
    }
    openScrollAtBottomRef.current = 'atBottom' in initialScroll && initialScroll.atBottom;
  }, [threadScrollKey, initialScroll]);

  useLayoutEffect(() => {
    const items = virtualizerRef.current.getVirtualItems();
    const msgs = messagesMeasureRef.current;
    let materialChange = false;
    for (const vi of items) {
      if (vi.index === rowCount - 1) continue;
      const m = msgs[vi.index];
      if (!m?.id || vi.size <= 2) continue;
      const hasDateSeparator = rowHeightCacheHasDateSeparator(msgs, vi.index);
      if (rowHeightCacheMeasuredChanged(m.id, vi.size, hasDateSeparator)) {
        materialChange = true;
      }
      rowHeightCacheRecordMeasured({
        messageId: m.id,
        rawHeightPx: vi.size,
        hasDateSeparator,
      });
    }
    if (materialChange) bumpHeightEstimates();
  }, [virtualMeasureKey, rowCount]);

  useMessageListScrollAnchor({
    containerRef: messagesContainerRef,
    virtualizer,
    isLoadingMoreRef,
    threadScrollKey,
    measurementRevision: virtualizer.getTotalSize(),
  });

  const pinBottomRafRef = useRef<number | null>(null);

  const schedulePinToBottom = useCallback(() => {
    if (pinBottomRafRef.current != null) return;
    pinBottomRafRef.current = requestAnimationFrame(() => {
      pinBottomRafRef.current = null;
      const len = messagesForScrollRef.current.length;
      if (len === 0) return;
      const el = messagesContainerRef.current;
      if (!el) return;
      if (!openScrollAtBottomRef.current) return;
      const settlingDecision = decideSettlingPinApply(
        layoutSettlingForBottomPinRef.current,
        openScrollAtBottomRef.current
      );
      if (settlingDecision.kind === 'none') return;
      const gapPx = layoutSettlingForBottomPinRef.current ? 56 : PIN_BOTTOM_SKIP_GAP_PX;
      if (isMessageListNearBottom(el, gapPx)) return;
      pinMessageListContainerToBottom(el);
    });
  }, []);

  const prevThreadScrollKeyRef = useRef<string | null | undefined>(undefined);
  const lastOpenPaintGenerationRef = useRef(0);
  const restoredScrollThreadRef = useRef<string | null>(null);

  const applyOpenScrollFromDecision = useCallback(
    (decision: ThreadInitialScroll, snapshot: ChatMessage[]) => {
      if (!messagesContainerRef.current) return;
      if ('atBottom' in decision && decision.atBottom) {
        pinMessageListContainerToBottomAfterLayout(() => messagesContainerRef.current, 3);
        return;
      }
      const anchorId = 'anchorMessageId' in decision ? decision.anchorMessageId : undefined;
      if (!anchorId) return;
      const idx = snapshot.findIndex((m) => m.id === anchorId);
      if (idx < 0) return;

      const highlightIfDeepLink = () => {
        if (highlightAnchorMessageId !== anchorId) return;
        const anchorEl = messagesContainerRef.current?.querySelector(
          `#message-${anchorId}`
        ) as HTMLElement | null;
        if (anchorEl) {
          applyScrollTargetMessageHighlight(anchorEl, { reducedMotion: reduceMotion });
        }
      };

      const anchorEl = messagesContainerRef.current.querySelector(
        `#message-${anchorId}`
      ) as HTMLElement | null;
      if (anchorEl) {
        anchorEl.scrollIntoView({ block: 'start', behavior: 'auto' });
        requestAnimationFrame(highlightIfDeepLink);
        return;
      }
      scrollVirtualizerToIndex(virtualizerRef.current, idx, {
        align: 'start',
        behavior: 'auto',
      });
      requestAnimationFrame(highlightIfDeepLink);
    },
    [highlightAnchorMessageId, reduceMotion]
  );

  useLayoutEffect(() => {
    if (prevThreadScrollKeyRef.current !== threadScrollKey) {
      prevThreadScrollKeyRef.current = threadScrollKey;
      restoredScrollThreadRef.current = null;
      lastOpenPaintGenerationRef.current = 0;
    }
    if (openPaintGeneration !== lastOpenPaintGenerationRef.current) {
      lastOpenPaintGenerationRef.current = openPaintGeneration;
      restoredScrollThreadRef.current = null;
    }
    if (!threadScrollKey) return;
    if (isSwitchingChatType || messages.length === 0) return;
    if (!messagesContainerRef.current) return;
    if (restoredScrollThreadRef.current === threadScrollKey) return;
    if (initialScroll === undefined) return;

    const openDecision = decideOpenScrollApply({
      initialScroll,
      openPaintGeneration,
      alreadyRestored: restoredScrollThreadRef.current === threadScrollKey,
    });
    if (openDecision.kind === 'none') return;

    restoredScrollThreadRef.current = threadScrollKey;
    applyOpenScrollFromDecision(initialScroll, messages);
  }, [
    threadScrollKey,
    isSwitchingChatType,
    messages,
    initialScroll,
    openPaintGeneration,
    applyOpenScrollFromDecision,
  ]);

  useLayoutEffect(() => {
    if (
      !layoutSettlingForBottomPin ||
      messages.length === 0 ||
      initialScroll === undefined ||
      !openScrollAtBottomRef.current
    )
      return;
    const inner = innerListRef.current;
    schedulePinToBottom();
    if (!inner) {
      return () => {
        if (pinBottomRafRef.current != null) {
          cancelAnimationFrame(pinBottomRafRef.current);
          pinBottomRafRef.current = null;
        }
      };
    }
    const ro = new ResizeObserver(() => {
      schedulePinToBottom();
    });
    ro.observe(inner);
    return () => {
      ro.disconnect();
      if (pinBottomRafRef.current != null) {
        cancelAnimationFrame(pinBottomRafRef.current);
        pinBottomRafRef.current = null;
      }
    };
  }, [layoutSettlingForBottomPin, messages.length, threadScrollKey, initialScroll, schedulePinToBottom]);

  useEffect(() => {
    if (!threadScrollKey) return;
    if (isSwitchingChatType || messages.length === 0) return;

    const tick = () => {
      if (threadScrollKey && restoredScrollThreadRef.current !== threadScrollKey) return;
      const el = messagesContainerRef.current;
      if (!el) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      if (layoutSettlingForBottomPin && nearBottom) return;
      const items = virtualizerRef.current.getVirtualItems();
      let anchorMessageId: string | null = null;
      for (const vi of items) {
        if (vi.index >= messagesForScrollRef.current.length) continue;
        const m = messagesForScrollRef.current[vi.index];
        if (m) {
          anchorMessageId = m.id;
          break;
        }
      }
      scheduleThreadScrollSave(threadScrollKey, {
        atBottom: nearBottom,
        anchorMessageId: nearBottom ? null : anchorMessageId,
      });
    };

    const el = messagesContainerRef.current;
    if (!el) return;
    el.addEventListener('scroll', tick, { passive: true });
    tick();
    return () => {
      el.removeEventListener('scroll', tick);
      flushThreadScrollSave(threadScrollKey);
    };
  }, [threadScrollKey, isSwitchingChatType, messages.length, layoutSettlingForBottomPin]);

  const scrollToMessageById = useCallback(
    (messageId: string) => {
      const idx = messages.findIndex(
        (m) =>
          m.id === messageId ||
          (m as { _optimisticId?: string })._optimisticId === messageId
      );
      if (idx < 0) {
        const el = messagesContainerRef.current?.querySelector(`#message-${messageId}`) as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const targetId = messages[idx]?.id ?? messageId;
      const el = messagesContainerRef.current?.querySelector(
        `#message-${targetId}`
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      scrollVirtualizerToIndex(virtualizer, idx, { align: 'center', behavior: 'smooth' });
    },
    [messages, virtualizer]
  );

  const onChatNearBottomRef = useRef(onChatScrollNearBottomChange);
  onChatNearBottomRef.current = onChatScrollNearBottomChange;
  const prevChatNearBottomReportedRef = useRef(true);
  /** Snapshot from previous effect — survives post-grow ResizeObserver clearing near-bottom. */
  const wasAtBottomBeforeGrowRef = useRef(true);

  useLayoutEffect(() => {
    const cb = onChatNearBottomRef.current;
    if (!threadScrollKey || !cb) return;
    prevChatNearBottomReportedRef.current = true;
    wasAtBottomBeforeGrowRef.current = true;
    cb(true);
  }, [threadScrollKey]);

  useLayoutEffect(() => {
    const el = messagesContainerRef.current;
    const cb = onChatNearBottomRef.current;
    if (!el || !cb) return;
    const threshold = 120;
    const tick = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      if (prevChatNearBottomReportedRef.current !== nearBottom) {
        prevChatNearBottomReportedRef.current = nearBottom;
        cb(nearBottom);
      }
    };
    el.addEventListener('scroll', tick, { passive: true });
    const ro = new ResizeObserver(tick);
    ro.observe(el);
    tick();
    return () => {
      el.removeEventListener('scroll', tick);
      ro.disconnect();
    };
  }, [
    messages.length,
    isLoadingMessages,
    isInitialLoad,
    isSwitchingChatType,
    threadScrollKey,
  ]);

  useImperativeHandle(
    ref,
    () => ({ scrollToMessageById, scrollToBottomAlign, scrollToBottomSmooth }),
    [scrollToMessageById, scrollToBottomAlign, scrollToBottomSmooth]
  );

  useEffect(() => {
    const wasLoading = isLoadingMoreRef.current;
    isLoadingMoreRef.current = isLoadingMore;

    const container = messagesContainerRef.current;
    if (!container) return;

    if (isLoadingMore) {
      previousScrollHeightRef.current = container.scrollHeight;
      previousScrollTopRef.current = container.scrollTop;
      justLoadedOlderMessagesRef.current = false;
    } else if (wasLoading) {
      justLoadedOlderMessagesRef.current = true;
      setTimeout(() => {
        justLoadedOlderMessagesRef.current = false;
      }, 500);
    }
  }, [isLoadingMore]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const currentMessageCount = messages.length;
    const previousMessageCount = previousMessageCountRef.current;
    const isNewMessagesAdded = currentMessageCount > previousMessageCount;
    const previousFirstId = previousFirstMessageIdRef.current;
    const currentFirstId = messages[0]?.id;

    let pinnedAfterGrow = false;
    if (isNewMessagesAdded) {
      const wasLoadingMore = isLoadingMoreRef.current || isLoadingMore;
      const justLoadedOlder = justLoadedOlderMessagesRef.current;
      const isPrependReconcile =
        previousMessageCount > 0 &&
        !wasLoadingMore &&
        !justLoadedOlder &&
        previousFirstId != null &&
        currentFirstId != null &&
        previousFirstId !== currentFirstId;

      if (wasLoadingMore || justLoadedOlder || isPrependReconcile) {
        const scrollDecision = decideNewMessagesScrollApply({
          isNewMessagesAdded: true,
          wasLoadingMore: wasLoadingMore || isLoadingMoreRef.current,
          justLoadedOlder,
          isPrependReconcile,
          layoutSettlingForBottomPin,
          wasAtBottom: wasAtBottomBeforeGrowRef.current,
        });
        if (scrollDecision.kind !== 'prepend-compensate') return;
        const previousScrollHeight = previousScrollHeightRef.current;
        const previousScrollTop = previousScrollTopRef.current;

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const c = messagesContainerRef.current;
            if (c) {
              const currentScrollHeight = c.scrollHeight;
              const scrollDifference = currentScrollHeight - previousScrollHeight;
              c.scrollTop = previousScrollTop + scrollDifference;
            }
          });
        });
      } else {
        const scrollDecision = decideNewMessagesScrollApply({
          isNewMessagesAdded: true,
          wasLoadingMore: false,
          justLoadedOlder: false,
          isPrependReconcile: false,
          layoutSettlingForBottomPin,
          wasAtBottom: wasAtBottomBeforeGrowRef.current,
        });
        if (scrollDecision.kind === 'append-pin-if-at-bottom' && messages.length > 0) {
          pinMessageListContainerToBottom(container);
          pinnedAfterGrow = true;
        }
      }
    }

    if (!isNewMessagesAdded || !(isLoadingMoreRef.current || isLoadingMore || justLoadedOlderMessagesRef.current)) {
      wasAtBottomBeforeGrowRef.current = pinnedAfterGrow
        ? true
        : prevChatNearBottomReportedRef.current;
    }

    previousMessageCountRef.current = currentMessageCount;
    previousFirstMessageIdRef.current = currentFirstId;
    if (!isLoadingMore) {
      requestAnimationFrame(() => {
        const c = messagesContainerRef.current;
        if (c) {
          previousScrollHeightRef.current = c.scrollHeight;
          previousScrollTopRef.current = c.scrollTop;
        }
      });
    }
  }, [messages, isLoadingMore, layoutSettlingForBottomPin]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      handleMessageListContextMenuScrollStart();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const loadMoreBlockedRef = useRef(false);
  loadMoreBlockedRef.current =
    isLoading || isLoadingMore || threadLayoutSettling || isInitialLoad;

  useEffect(() => {
    const root = messagesContainerRef.current;
    const target = topLoadSentinelRef.current;
    if (!root || !target || !onLoadMore || !hasMoreMessages || messages.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (loadMoreBlockedRef.current) return;
        const now = Date.now();
        if (now - loadMoreCooldownRef.current < 400) return;
        loadMoreCooldownRef.current = now;
        onLoadMore();
      },
      { root, rootMargin: '160px 0px 0px 0px', threshold: 0 }
    );
    io.observe(target);
    return () => io.disconnect();
  }, [onLoadMore, hasMoreMessages, isInitialLoad, isSwitchingChatType, messages.length]);

  const rowHandlers = useMemo(
    () => ({
      onAddReaction,
      onRemoveReaction,
      onDeleteMessage,
      onReplyMessage,
      onEditMessage,
      onPollUpdated,
      onResendQueued,
      onRemoveFromQueue,
      onScrollToMessage,
      isChannel,
      userChatUser1Id,
      userChatUser2Id,
      onChatRequestRespond,
      onPin,
      onUnpin,
      showReply,
      onForwardMessage,
    }),
    [
      onAddReaction,
      onRemoveReaction,
      onDeleteMessage,
      onReplyMessage,
      onEditMessage,
      onPollUpdated,
      onResendQueued,
      onRemoveFromQueue,
      onScrollToMessage,
      isChannel,
      userChatUser1Id,
      userChatUser2Id,
      onChatRequestRespond,
      onPin,
      onUnpin,
      showReply,
      onForwardMessage,
    ]
  );

  const isMessagesPending = isThreadMessagesPending(isLoadingMessages, isInitialLoad);

  const messageRowKeys = useMemo(
    () => messages.map((m) => getMessageRowKey(m)),
    [messages]
  );
  const newMessageKeys = useMessageListNewKeys(messageRowKeys, threadScrollKey ?? undefined);
  const consumeDateSeparatorFade = useMessageListSeenDateSeparators(threadScrollKey ?? undefined);
  const newKeyStaggerIndex = useMemo(() => {
    const map = new Map<string, number>();
    let i = 0;
    for (const key of messageRowKeys) {
      if (newMessageKeys.has(key)) map.set(key, i++);
    }
    return map;
  }, [messageRowKeys, newMessageKeys]);

  const virtualItems = virtualizer.getVirtualItems();
  const rowStyles = useVirtualRowLayoutTransition(messagesContainerRef, virtualItems, !reduceMotion);
  const totalHeight = virtualizer.getTotalSize();
  const showLoading = messages.length === 0 && isMessagesPending;
  const showEmpty = messages.length === 0 && !isMessagesPending;
  const showMessages = messages.length > 0;
  const panelTransition = reduceMotion ? { duration: 0 } : CHAT_PANEL_TRANSITION;
  const heightTransition = reduceMotion ? { duration: 0 } : CHAT_LIST_HEIGHT_TRANSITION;

  const emptyStateContent = (
    <div className="text-center">
      <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg
          className="w-8 h-8 text-gray-400 dark:text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('chat.messages.noMessages')}</h3>
    </div>
  );

  const threadStatusLayer = reduceMotion ? (
    showLoading ? (
      <div className="absolute inset-0 flex items-center justify-center" role="status" aria-label={t('common.loading')}>
        <WavyDots />
      </div>
    ) : showEmpty ? (
      <div className="absolute inset-0 flex items-center justify-center">{emptyStateContent}</div>
    ) : null
  ) : (
    <AnimatePresence mode="wait" initial={false}>
      {showLoading ? (
        <motion.div
          key="thread-loading"
          className="absolute inset-0 z-[3] flex items-center justify-center bg-gray-50 dark:bg-gray-800 pointer-events-none"
          initial={{ opacity: 0, y: CHAT_MESSAGE_ENTER_Y }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -CHAT_MESSAGE_ENTER_Y }}
          transition={panelTransition}
          role="status"
          aria-label={t('common.loading')}
        >
          <WavyDots />
        </motion.div>
      ) : showEmpty ? (
        <motion.div
          key="thread-empty"
          className="absolute inset-0 z-[3] flex items-center justify-center bg-gray-50 dark:bg-gray-800 pointer-events-none"
          initial={{ opacity: 0, y: CHAT_MESSAGE_ENTER_Y, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -CHAT_MESSAGE_ENTER_Y }}
          transition={panelTransition}
        >
          {emptyStateContent}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <MessageListSettlingProvider value={settlingRefs}>
      <div className="relative flex-1 min-h-0 bg-gray-50 dark:bg-gray-800">
        {showMessages ? (
          <div
            ref={messagesContainerRef}
            className="relative flex-1 overflow-y-auto overflow-x-hidden scrollbar-auto p-4 min-h-0 overscroll-contain h-full"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {isSwitchingChatType ? (
              <div
                className="pointer-events-none absolute top-0 left-4 right-4 z-[2] h-1 rounded-full bg-primary-400/35 dark:bg-primary-500/25 animate-pulse"
                aria-hidden
              />
            ) : null}
            {hasContextPanel && <div className="pt-6 flex-shrink-0" />}
            <div
              ref={topLoadSentinelRef}
              className="w-full shrink-0 flex flex-col items-center justify-center min-h-[8px] py-2 pointer-events-none gap-2"
              aria-hidden
            >
              {isLoadingMore && hasMoreMessages ? (
                <div
                  className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-blue-500 dark:border-gray-600 dark:border-t-blue-400 animate-spin"
                  role="status"
                />
              ) : null}
            </div>
            <motion.div
              ref={innerListRef}
              className="space-y-1 relative w-full"
              initial={false}
              animate={{ height: totalHeight }}
              transition={heightTransition}
            >
              {virtualItems.map((row) => {
                const message = row.index < messages.length ? messages[row.index] : undefined;
                const rowKey = message ? getMessageRowKey(message) : String(row.key);
                const dateSeparatorLabel = message
                  ? getChatDateSeparatorLabel(messages, row.index)
                  : null;
                return (
                  <MessageListRow
                    key={row.key}
                    row={row}
                    rowStyle={rowStyles.get(String(row.key)) ?? { transform: `translateY(${row.start}px)` }}
                    message={message}
                    messages={messages}
                    rowCount={rowCount}
                    measureElement={virtualizer.measureElement}
                    eagerMediaMessageIds={eagerMediaMessageIds}
                    replyCount={message ? (replyCountMap.get(message.id) ?? 0) : 0}
                    isPinned={message ? pinnedSet.has(message.id) : false}
                    isNew={message ? newMessageKeys.has(rowKey) : false}
                    staggerIndex={message ? (newKeyStaggerIndex.get(rowKey) ?? 0) : 0}
                    fadeDateSeparator={
                      dateSeparatorLabel ? consumeDateSeparatorFade(dateSeparatorLabel) : false
                    }
                    onScrollToFirstReply={onScrollToFirstReply}
                    handlers={rowHandlers}
                  />
                );
              })}
            </motion.div>
          </div>
        ) : null}
        {threadStatusLayer}
      </div>
    </MessageListSettlingProvider>
  );
});

export const MessageList = memo(MessageListInner, messageListPropsEqual);
