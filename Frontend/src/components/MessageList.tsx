import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
  useState,
  useReducer,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChatMessage, Poll } from '@/api/chat';
import { AnimatedMessageItem } from './AnimatedMessageItem';
import { useContextMenuManager } from '@/hooks/useContextMenuManager';
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
import type { ThreadInitialScroll } from '@/services/chat/chatOpenScrollPolicy';
import { getMessageRowKey } from '@/services/chat/messageRowKey';
import { ChatDateSeparator } from '@/components/chat/ChatDateSeparator';
import { getChatDateSeparatorLabel } from '@/utils/chatDateSeparator';
import { isThreadMessagesPending } from '@/pages/GameChat/threadViewLoadingState';
import { WavyDots } from '@/components/WavyDots';

const OPEN_TAIL_EAGER_MEDIA = 60;
const VIRTUAL_OVERSCAN_BASE = 10;
const VIRTUAL_OVERSCAN_FAST = 22;
/** Skip redundant scrollToIndex(end) when already visually pinned (subpixel / end spacer). */
const PIN_BOTTOM_SKIP_GAP_PX = 20;

export type MessageListHandle = {
  scrollToMessageById: (messageId: string) => void;
  scrollToBottomAlign: () => void;
  scrollToBottomSmooth: () => void;
};

interface MessageListProps {
  messages: ChatMessage[];
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyMessage: (message: ChatMessage) => void;
  onEditMessage?: (message: ChatMessage) => void;
  onPollUpdated?: (messageId: string, updatedPoll: Poll) => void;
  onResendQueued?: (tempId: string) => void;
  onRemoveFromQueue?: (tempId: string) => void;
  isLoading?: boolean;
  isLoadingMessages?: boolean;
  isSwitchingChatType?: boolean;
  onScrollToMessage?: (messageId: string) => void;
  hasMoreMessages?: boolean;
  onLoadMore?: () => void;
  isInitialLoad?: boolean;
  isLoadingMore?: boolean;
  isChannel?: boolean;
  userChatUser1Id?: string;
  userChatUser2Id?: string;
  onChatRequestRespond?: (messageId: string, accepted: boolean) => void;
  hasContextPanel?: boolean;
  pinnedMessageIds?: string[];
  onPin?: (message: ChatMessage) => void;
  onUnpin?: (messageId: string) => void;
  showReply?: boolean;
  onForwardMessage?: (message: ChatMessage) => void;
  threadScrollKey?: string | null;
  /** Coordinator scroll decision; set with first open paint (undefined until committed). */
  initialScroll?: ThreadInitialScroll;
  /** Bumped on each atomic open paint so scroll restore re-runs for the new snapshot. */
  openPaintGeneration?: number;
  /** While true, parent signals loading/initial paint; list extends this until tail row heights are preloaded. */
  threadLayoutSettling?: boolean;
  onChatScrollNearBottomChange?: (nearBottom: boolean) => void;
}

export const MessageList = forwardRef<MessageListHandle, MessageListProps>(function MessageList(
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
    openPaintGeneration = 0,
    threadLayoutSettling = false,
    onChatScrollNearBottomChange,
  },
  ref
) {
  const { t } = useTranslation();
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
  const { contextMenuState, openContextMenu, closeContextMenu, handleScrollStart } = useContextMenuManager();
  const activeContextMenuMessageId = contextMenuState.isOpen ? contextMenuState.messageId : null;

  const replyCountMap = useMemo(() => buildReplyCountMap(messages), [messages]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const onScrollToFirstReply = useCallback((parentMessageId: string) => {
    const firstId = findFirstReplyId(messagesRef.current, parentMessageId);
    if (firstId) onScrollToMessage?.(firstId);
  }, [onScrollToMessage]);

  const rowCount = messages.length + 1;
  const [virtualOverscan, setVirtualOverscan] = useState(VIRTUAL_OVERSCAN_BASE);
  const scrollVelRef = useRef({ top: 0, t: 0 });
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
    overscan: virtualOverscan,
    getItemKey: (index) =>
      index === rowCount - 1 ? '__end__' : (messages[index] ? getMessageRowKey(messages[index]) : `i-${index}`),
  });

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

  const suppressOpenReactionMotion = threadLayoutSettling;

  const lastSeededTailKeyRef = useRef('');

  useLayoutEffect(() => {
    if (threadScrollKey) lastSeededTailKeyRef.current = '';
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
    for (const vi of items) {
      if (vi.index === rowCount - 1) continue;
      const m = msgs[vi.index];
      if (m?.id && vi.size > 2) {
        rowHeightCacheRecordMeasured({
          messageId: m.id,
          rawHeightPx: vi.size,
          hasDateSeparator: rowHeightCacheHasDateSeparator(msgs, vi.index),
        });
      }
    }
  }, [virtualMeasureKey, rowCount]);

  const overscanRafRef = useRef<number | null>(null);
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
      const anchorEl = messagesContainerRef.current.querySelector(
        `#message-${anchorId}`
      ) as HTMLElement | null;
      if (anchorEl) {
        anchorEl.scrollIntoView({ block: 'start', behavior: 'auto' });
        return;
      }
      scrollVirtualizerToIndex(virtualizerRef.current, idx, {
        align: 'start',
        behavior: 'auto',
      });
    },
    []
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
    const onScrollVel = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const top = el.scrollTop;
      const prev = scrollVelRef.current;
      const dt = Math.max(now - prev.t, 1);
      const pxPerMs = Math.abs(top - prev.top) / dt;
      scrollVelRef.current = { top, t: now };
      const wantFast = pxPerMs > 0.35;
      if (overscanRafRef.current != null) cancelAnimationFrame(overscanRafRef.current);
      overscanRafRef.current = requestAnimationFrame(() => {
        overscanRafRef.current = null;
        setVirtualOverscan((cur) => {
          const next = wantFast ? VIRTUAL_OVERSCAN_FAST : VIRTUAL_OVERSCAN_BASE;
          return cur === next ? cur : next;
        });
      });
    };
    el.addEventListener('scroll', tick, { passive: true });
    el.addEventListener('scroll', onScrollVel, { passive: true });
    tick();
    return () => {
      el.removeEventListener('scroll', tick);
      el.removeEventListener('scroll', onScrollVel);
      if (overscanRafRef.current != null) cancelAnimationFrame(overscanRafRef.current);
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
      handleScrollStart();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScrollStart]);

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

  const isMessagesPending = isThreadMessagesPending(isLoadingMessages, isInitialLoad);

  if (messages.length === 0 && isMessagesPending) {
    return (
      <div
        className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-800"
        role="status"
        aria-label={t('common.loading')}
      >
        <WavyDots />
      </div>
    );
  }

  if (messages.length === 0 && !isMessagesPending) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
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
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={messagesContainerRef}
      className="relative flex-1 overflow-y-auto overflow-x-hidden scrollbar-auto bg-gray-50 dark:bg-gray-800 p-4 min-h-0 overscroll-contain"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {isSwitchingChatType && messages.length > 0 ? (
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
      <div
        ref={innerListRef}
        className="space-y-1 relative w-full"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
        }}
      >
        {virtualItems.map((row) => {
          if (row.index === rowCount - 1) {
            return (
              <div
                key={row.key}
                data-index={row.index}
                ref={virtualizer.measureElement}
                className="left-0 top-0 w-full"
                style={{
                  position: 'absolute',
                  transform: `translateY(${row.start}px)`,
                }}
                aria-hidden
              >
                <div className="h-32" />
              </div>
            );
          }
          const message = messages[row.index]!;
          const dateSeparatorLabel = getChatDateSeparatorLabel(messages, row.index);
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              id={`message-${message.id}`}
              className="left-0 top-0 w-full"
              style={{
                position: 'absolute',
                transform: `translateY(${row.start}px)`,
              }}
            >
              {dateSeparatorLabel ? <ChatDateSeparator label={dateSeparatorLabel} /> : null}
              <AnimatedMessageItem
                message={message}
                staggerKey={getMessageRowKey(message)}
                skipStaggerOnOpen={threadLayoutSettling || isInitialLoad}
                suppressOpenReactionMotion={suppressOpenReactionMotion}
                loadMediaEager={eagerMediaMessageIds.has(message.id)}
                onAddReaction={onAddReaction}
                onRemoveReaction={onRemoveReaction}
                onDeleteMessage={onDeleteMessage}
                onReplyMessage={onReplyMessage}
                onEditMessage={onEditMessage}
                onPollUpdated={onPollUpdated}
                onResendQueued={onResendQueued}
                onRemoveFromQueue={onRemoveFromQueue}
                activeContextMenuMessageId={activeContextMenuMessageId}
                contextMenuState={contextMenuState}
                onOpenContextMenu={openContextMenu}
                onCloseContextMenu={closeContextMenu}
                replyCount={replyCountMap.get(message.id) ?? 0}
                onScrollToFirstReply={onScrollToFirstReply}
                onScrollToMessage={onScrollToMessage}
                isChannel={isChannel}
                userChatUser1Id={userChatUser1Id}
                userChatUser2Id={userChatUser2Id}
                onChatRequestRespond={onChatRequestRespond}
                isPinned={pinnedSet.has(message.id)}
                onPin={onPin}
                onUnpin={onUnpin}
                showReply={showReply}
                onForwardMessage={onForwardMessage}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});
