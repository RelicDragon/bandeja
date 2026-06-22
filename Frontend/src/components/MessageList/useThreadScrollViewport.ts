import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ChatMessage } from '@/api/chat';
import type { ThreadInitialScroll } from '@/services/chat/chatOpenScrollPolicy';
import {
  flushThreadScrollSave,
  scheduleThreadScrollSave,
} from '@/services/chat/chatThreadScroll';
import {
  END_SPACER_PX,
  registerRowHeightBump,
  rowHeightCacheEstimate,
  rowHeightCacheHasDateSeparator,
  rowHeightCacheMeasuredChanged,
  rowHeightCacheRecordMeasured,
} from '@/services/chat/rowHeightCache';
import { decideOpenScrollApply, decideSettlingPinApply } from '@/services/chat/threadScrollPolicy';
import {
  isMessageListNearBottom,
  MESSAGE_LIST_NEAR_BOTTOM_PX,
  pinMessageListContainerToBottom,
  pinMessageListContainerToBottomAfterLayout,
  scrollVirtualizerToIndex,
} from '@/utils/messageListScroll';
import { getMessageRowKey } from '@/services/chat/messageRowKey';
import { applyScrollTargetMessageHighlight } from '@/utils/scrollTargetMessageHighlight';
import { useVirtualRowLayoutTransition } from '@/components/chat/useVirtualRowLayoutTransition';
import { handleMessageListContextMenuScrollStart } from './messageListContextMenuStore';
import { resolveMessageListLayoutMotion } from './messageListLayoutMotion';
import { useMessageListNearBottom } from './useMessageListNearBottom';
import { useMessageListPrependCompensation } from './useMessageListPrependCompensation';
import { useMessageListScrollAnchor } from './useMessageListScrollAnchor';
import { useMessageListScrollTarget } from './useMessageListScrollTarget';
import { useMessageListTailHeightPreload } from './useMessageListTailHeightPreload';
import { useThreadScrollContainerEvents } from './useThreadScrollContainerEvents';
import type {
  ThreadScrollViewportInput,
  ThreadScrollViewportRenderContext,
  ThreadScrollViewportResult,
} from './threadScrollViewportTypes';

const OPEN_TAIL_EAGER_MEDIA = 60;
const VIRTUAL_OVERSCAN = 12;
const PIN_BOTTOM_SKIP_GAP_PX = 20;

export function useThreadScrollViewport({
  messages,
  threadScrollKey = null,
  initialScroll,
  highlightAnchorMessageId,
  openPaintGeneration = 0,
  threadLayoutSettling,
  onChatScrollNearBottomChange,
  hasMoreMessages = false,
  onLoadMore,
  isLoading = false,
  isLoadingMore = false,
  isInitialLoad = false,
  isLoadingMessages = false,
  isSwitchingChatType = false,
  scrollTargetMessageId = null,
  reduceMotion,
}: ThreadScrollViewportInput): ThreadScrollViewportResult {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const innerListRef = useRef<HTMLDivElement>(null);
  const topLoadSentinelRef = useRef<HTMLDivElement>(null);
  const openScrollAtBottomRef = useRef(false);
  const isLoadingMoreRef = useRef(false);
  const loadMoreCooldownRef = useRef(0);
  const layoutSettlingRef = useRef(threadLayoutSettling);
  layoutSettlingRef.current = threadLayoutSettling;
  const isInitialLoadRef = useRef(isInitialLoad);
  isInitialLoadRef.current = isInitialLoad;
  const settlingRefs = useMemo(
    () => ({ layoutSettlingRef, isInitialLoadRef }),
    []
  );

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
  const messagesMeasureRef = useRef(messages);
  messagesMeasureRef.current = messages;

  const containerActive = messages.length > 0;
  const containerEvents = useThreadScrollContainerEvents(messagesContainerRef, containerActive);

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

  useMessageListTailHeightPreload({
    containerRef: messagesContainerRef,
    messagesMeasureRef,
    threadScrollKey,
    tailIdsForHeightPreload,
    bumpHeightEstimates,
    openScrollAtBottomRef,
    layoutSettlingRef,
    initialScroll,
    containerEvents,
  });

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

  const wasAtBottomBeforeGrowRef = useRef(true);

  const { isNearBottomRef } = useMessageListNearBottom(messagesContainerRef, {
    threadScrollKey,
    onChange: onChatScrollNearBottomChange,
    messagesLength: messages.length,
    isLoadingMessages,
    isInitialLoad,
    isSwitchingChatType,
    containerEvents,
  });

  const { justLoadedOlderMessagesRef, prependCompensationEpochRef } = useMessageListPrependCompensation({
    containerRef: messagesContainerRef,
    messages,
    isLoadingMore,
    isLoadingMoreRef,
    threadScrollKey,
    layoutSettlingForBottomPin,
    wasAtBottomBeforeGrowRef,
    isNearBottomRef,
    scrollTargetMessageId,
  });

  useMessageListScrollTarget({
    scrollTargetMessageId,
    messages,
    containerRef: messagesContainerRef,
    virtualizer,
    openScrollAtBottomRef,
    wasAtBottomBeforeGrowRef,
    virtualMeasureKey,
    reduceMotion,
  });

  useMessageListScrollAnchor({
    containerRef: messagesContainerRef,
    virtualizer,
    isLoadingMoreRef,
    justLoadedOlderMessagesRef,
    prependCompensationEpochRef,
    threadScrollKey,
    measurementRevision: virtualizer.getTotalSize(),
  });

  const pinBottomRafRef = useRef<number | null>(null);

  const schedulePinToBottom = useCallback(() => {
    if (scrollTargetMessageId) return;
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
  }, [scrollTargetMessageId]);

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
      const container = messagesContainerRef.current;
      if (container) container.scrollTop = 0;
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
      !openScrollAtBottomRef.current ||
      scrollTargetMessageId
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
  }, [layoutSettlingForBottomPin, messages.length, threadScrollKey, initialScroll, schedulePinToBottom, scrollTargetMessageId]);

  useEffect(() => {
    if (!threadScrollKey) return;
    if (isSwitchingChatType || messages.length === 0) return;

    const tick = () => {
      if (threadScrollKey && restoredScrollThreadRef.current !== threadScrollKey) return;
      const el = messagesContainerRef.current;
      if (!el) return;
      const nearBottom = isMessageListNearBottom(el, MESSAGE_LIST_NEAR_BOTTOM_PX);
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

    const unsubscribe = containerEvents.subscribe(tick);
    containerEvents.tick();
    return () => {
      unsubscribe();
      flushThreadScrollSave(threadScrollKey);
    };
  }, [
    threadScrollKey,
    isSwitchingChatType,
    messages.length,
    layoutSettlingForBottomPin,
    containerEvents,
  ]);

  useEffect(() => {
    return containerEvents.subscribe(handleMessageListContextMenuScrollStart);
  }, [containerEvents]);

  const scrollToBottomAlign = useCallback(() => {
    pinMessageListContainerToBottomAfterLayout(() => messagesContainerRef.current, 3);
  }, []);

  const scrollToBottomSmooth = useCallback(() => {
    pinMessageListContainerToBottom(messagesContainerRef.current, { behavior: 'smooth' });
  }, []);

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

  const initialSmoothScrollDoneRef = useRef(false);
  const prevIsInitialLoadRef = useRef(isInitialLoad);
  const prevIsLoadingMessagesRef = useRef(isLoadingMessages);

  useLayoutEffect(() => {
    wasAtBottomBeforeGrowRef.current = true;
    initialSmoothScrollDoneRef.current = false;
  }, [threadScrollKey]);

  useEffect(() => {
    const wasInitialLoad = prevIsInitialLoadRef.current;
    const wasLoadingMessages = prevIsLoadingMessagesRef.current;
    const isLoadComplete = wasInitialLoad && !isInitialLoad;
    const isMessagesLoadComplete = wasLoadingMessages && !isLoadingMessages;
    const shouldTrigger = isLoadComplete || isMessagesLoadComplete;

    prevIsInitialLoadRef.current = isInitialLoad;
    prevIsLoadingMessagesRef.current = isLoadingMessages;

    if (!shouldTrigger) return;
    if (initialSmoothScrollDoneRef.current) return;
    if (scrollTargetMessageId) return;
    if (!threadScrollKey) return;
    if (messages.length === 0) return;
    if (!openScrollAtBottomRef.current) return;

    const container = messagesContainerRef.current;
    if (!container) return;

    const nearBottom = isMessageListNearBottom(container, MESSAGE_LIST_NEAR_BOTTOM_PX);
    if (!nearBottom) {
      initialSmoothScrollDoneRef.current = true;
      return;
    }

    const timer = setTimeout(() => {
      if (layoutSettlingRef.current) return;
      initialSmoothScrollDoneRef.current = true;
      scrollToBottomSmooth();
    }, 100);

    return () => clearTimeout(timer);
  }, [isInitialLoad, isLoadingMessages, threadScrollKey, messages.length, scrollToBottomSmooth, scrollTargetMessageId]);

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

  const virtualItems = virtualizer.getVirtualItems();
  const { heightTransition, rowLayoutTransitionEnabled } = resolveMessageListLayoutMotion({
    reduceMotion,
    threadLayoutSettling,
    isNearBottom: isNearBottomRef.current,
  });
  const rowStyles = useVirtualRowLayoutTransition(
    messagesContainerRef,
    virtualItems,
    rowLayoutTransitionEnabled,
    containerEvents.subscribe
  );
  const totalHeight = virtualizer.getTotalSize();

  const renderContext: ThreadScrollViewportRenderContext = {
    virtualItems,
    rowCount,
    totalHeight,
    measureElement: virtualizer.measureElement,
    rowStyles,
    heightTransition,
    rowLayoutTransitionEnabled,
    eagerMediaMessageIds,
  };

  const imperativeHandle = useMemo(
    () => ({
      scrollToMessageById,
      scrollToBottomAlign,
      scrollToBottomSmooth,
    }),
    [scrollToMessageById, scrollToBottomAlign, scrollToBottomSmooth]
  );

  return {
    containerRef: messagesContainerRef,
    innerListRef,
    topLoadSentinelRef,
    settlingRefs,
    renderContext,
    imperativeHandle,
  };
}
