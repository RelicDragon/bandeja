import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { measureElement as measureVirtualElement, useVirtualizer } from '@tanstack/react-virtual';
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
import {
  decideInitialLoadTailPin,
  shouldAdoptOpenAtBottomFromInitialScroll,
  shouldPinAfterSettlingEnds,
  shouldReleaseBottomIntentOnViewportTick,
} from './messageListOpenBottomIntent';
import { useMessageListNearBottom } from './useMessageListNearBottom';
import { useMessageListPrependCompensation } from './useMessageListPrependCompensation';
import { useMessageListScrollTarget } from './useMessageListScrollTarget';
import { useMessageListTailHeightPreload } from './useMessageListTailHeightPreload';
import { useThreadScrollContainerEvents } from './useThreadScrollContainerEvents';
import { shouldAdjustForMessageRowResize } from './messageListResizeAnchorPolicy';
import type {
  ThreadScrollViewportInput,
  ThreadScrollViewportRenderContext,
  ThreadScrollViewportResult,
} from './threadScrollViewportTypes';

const OPEN_TAIL_EAGER_MEDIA = 60;
/**
 * Rows kept mounted beyond the viewport on each side. Every mounted row carries a Framer node,
 * media elements and reaction chrome, and the per-frame render work below scales linearly with
 * this number. The row-height cache seeds accurate estimates, so a deep buffer is not needed to
 * keep fling-scroll from showing blanks.
 */
const VIRTUAL_OVERSCAN = 20;
/** Tail length seeded into the row-height cache before the open paint. */
const TAIL_HEIGHT_PRELOAD_COUNT = 140;
const PIN_BOTTOM_SKIP_GAP_PX = 20;
/** Match pinMessageListContainerToBottomAfterLayout default frame count. */
const PROGRAMMATIC_SCROLL_HOLD_FRAMES = 3;

function hashNumber(hash: number, value: number): number {
  return Math.imul(hash ^ value, 16777619);
}

function hashString(hash: number, value: string): number {
  let h = hash;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h;
}

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
  loadingScrollTargetId = null,
  onScrollTargetReached,
  reduceMotion,
}: ThreadScrollViewportInput): ThreadScrollViewportResult {
  const scrollTargetLockId = loadingScrollTargetId ?? scrollTargetMessageId ?? null;
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const innerListRef = useRef<HTMLDivElement>(null);
  const topLoadSentinelRef = useRef<HTMLDivElement>(null);
  const openScrollAtBottomRef = useRef(false);
  const userReleasedBottomIntentRef = useRef(false);
  const wasAtBottomBeforeGrowRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const programmaticScrollHoldRef = useRef(0);
  const programmaticReleaseRafRef = useRef<number | null>(null);
  const cancelBottomPinRef = useRef<(() => void) | null>(null);
  const isLoadingMoreRef = useRef(false);
  const loadMoreCooldownRef = useRef(0);
  const layoutSettlingRef = useRef(threadLayoutSettling);
  layoutSettlingRef.current = threadLayoutSettling;

  const runProgrammaticScroll = useCallback((fn: () => void, holdFrames = 1) => {
    programmaticScrollRef.current = true;
    programmaticScrollHoldRef.current = Math.max(programmaticScrollHoldRef.current, holdFrames);
    fn();
    if (programmaticReleaseRafRef.current != null) cancelAnimationFrame(programmaticReleaseRafRef.current);
    const release = () => {
      programmaticReleaseRafRef.current = null;
      programmaticScrollHoldRef.current = Math.max(0, programmaticScrollHoldRef.current - 1);
      if (programmaticScrollHoldRef.current <= 0) {
        programmaticScrollRef.current = false;
        return;
      }
      programmaticReleaseRafRef.current = requestAnimationFrame(release);
    };
    programmaticReleaseRafRef.current = requestAnimationFrame(release);
  }, []);

  const cancelProgrammaticScroll = useCallback(() => {
    cancelBottomPinRef.current?.();
    cancelBottomPinRef.current = null;
    if (programmaticReleaseRafRef.current != null) cancelAnimationFrame(programmaticReleaseRafRef.current);
    programmaticReleaseRafRef.current = null;
    programmaticScrollHoldRef.current = 0;
    programmaticScrollRef.current = false;
  }, []);

  useLayoutEffect(() => cancelProgrammaticScroll, [threadScrollKey, cancelProgrammaticScroll]);

  const pinBottomAfterLayout = useCallback(() => {
    cancelBottomPinRef.current?.();
    const container = messagesContainerRef.current;
    cancelBottomPinRef.current = pinMessageListContainerToBottomAfterLayout(
      () => messagesContainerRef.current === container ? container : null,
      PROGRAMMATIC_SCROLL_HOLD_FRAMES
    );
  }, []);

  const releaseBottomIntent = useCallback(() => {
    cancelProgrammaticScroll();
    openScrollAtBottomRef.current = false;
    userReleasedBottomIntentRef.current = true;
    wasAtBottomBeforeGrowRef.current = false;
  }, [cancelProgrammaticScroll]);
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

  const getItemKey = useCallback((index: number) =>
    index === rowCount - 1 ? '__end__' : (messages[index] ? getMessageRowKey(messages[index]) : `i-${index}`),
  [messages, rowCount]);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => messagesContainerRef.current,
    estimateSize: (index) => {
      if (index === rowCount - 1) return END_SPACER_PX;
      return rowHeightCacheEstimate({ message: messages[index], index, messages });
    },
    overscan: VIRTUAL_OVERSCAN,
    getItemKey,
    measureElement: (element, entry, instance) => {
      const height = measureVirtualElement(element, entry, instance);
      const index = instance.indexFromElement(element);
      const message = messages[index];
      if (message?.id && height > 2) {
        rowHeightCacheRecordMeasured({
          messageId: message.id,
          rawHeightPx: height,
          hasDateSeparator: rowHeightCacheHasDateSeparator(messages, index),
        });
      }
      return height;
    },
  });

  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  const messagesForScrollRef = useRef(messages);
  messagesForScrollRef.current = messages;
  const messagesMeasureRef = useRef(messages);
  messagesMeasureRef.current = messages;

  const containerActive = messages.length > 0;
  const containerEvents = useThreadScrollContainerEvents(messagesContainerRef, containerActive);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      cancelProgrammaticScroll();
      if (event.deltaY < 0) releaseBottomIntent();
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', cancelProgrammaticScroll, { passive: true });
    el.addEventListener('pointerdown', cancelProgrammaticScroll, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', cancelProgrammaticScroll);
      el.removeEventListener('pointerdown', cancelProgrammaticScroll);
    };
  }, [containerActive, cancelProgrammaticScroll, releaseBottomIntent]);

  // Rolling 32-bit hash rather than a joined string: this runs on every scroll-driven render
  // with ~90 rows live, and the string form allocated a template literal per row per frame.
  const virtualItemsSnapshot = virtualizer.getVirtualItems();
  let measureHash = 2166136261;
  for (const vi of virtualItemsSnapshot) {
    if (vi.index >= rowCount - 1) continue;
    measureHash = hashNumber(measureHash, vi.index);
    measureHash = hashString(measureHash, messages[vi.index]?.id ?? '');
    measureHash = hashNumber(measureHash, Math.round(vi.size));
  }
  const virtualMeasureKey = measureHash >>> 0;

  const tailIdsForHeightPreload = useMemo(
    () => messages.slice(-TAIL_HEIGHT_PRELOAD_COUNT).map((m) => m.id).join('\x1e'),
    [messages]
  );

  const eagerMediaMessageIds = useMemo(() => {
    const tail = messages.slice(-OPEN_TAIL_EAGER_MEDIA);
    return new Set(
      tail
        .filter(
          (m) =>
            (m.mediaUrls?.length ?? 0) > 0 &&
            m.messageType !== 'VIDEO' &&
            m.messageType !== 'DOCUMENT' &&
            m.messageType !== 'VOICE'
        )
        .map((m) => m.id)
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

  // Reset release before adopt — React runs layout effects in declaration order; a stale
  // release from the previous thread must not block open-at-bottom on the next thread.
  useLayoutEffect(() => {
    userReleasedBottomIntentRef.current = false;
    wasAtBottomBeforeGrowRef.current = true;
    openScrollAtBottomRef.current = false;
  }, [threadScrollKey]);

  useLayoutEffect(() => {
    if (initialScroll === undefined) return;
    const atBottom = 'atBottom' in initialScroll && initialScroll.atBottom;
    if (
      shouldAdoptOpenAtBottomFromInitialScroll({
        initialScrollAtBottom: atBottom,
        userReleasedBottomIntent: userReleasedBottomIntentRef.current,
      })
    ) {
      openScrollAtBottomRef.current = true;
      return;
    }
    if (!atBottom) {
      openScrollAtBottomRef.current = false;
    }
  }, [threadScrollKey, initialScroll]);

  const { isNearBottomRef } = useMessageListNearBottom(messagesContainerRef, {
    threadScrollKey,
    onChange: onChatScrollNearBottomChange,
    messagesLength: messages.length,
    isLoadingMessages,
    isInitialLoad,
    isSwitchingChatType,
    containerEvents,
  });
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => {
    if (isNearBottomRef.current && !instance.isScrolling) return true;
    return shouldAdjustForMessageRowResize({
      isScrolling: instance.isScrolling,
      itemStart: item.start,
      scrollOffset: instance.scrollOffset ?? 0,
    });
  };

  const { justLoadedOlderMessagesRef } = useMessageListPrependCompensation({
    containerRef: messagesContainerRef,
    messages,
    isLoadingMore,
    isLoadingMoreRef,
    threadScrollKey,
    layoutSettlingForBottomPin,
    wasAtBottomBeforeGrowRef,
    isNearBottomRef,
    scrollTargetLockId,
  });

  // TanStack owns row-size compensation. A second measurement-delta scroll here
  // applies the same correction twice and moves the message the user is reading.

  useMessageListScrollTarget({
    scrollTargetMessageId,
    messages,
    containerRef: messagesContainerRef,
    virtualizer,
    openScrollAtBottomRef,
    wasAtBottomBeforeGrowRef,
    userReleasedBottomIntentRef,
    virtualMeasureKey,
    reduceMotion,
    onScrollTargetReached,
  });

  const pinBottomRafRef = useRef<number | null>(null);

  const schedulePinToBottom = useCallback(() => {
    if (scrollTargetLockId) return;
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
      runProgrammaticScroll(() => {
        pinMessageListContainerToBottom(el);
      }, PROGRAMMATIC_SCROLL_HOLD_FRAMES);
    });
  }, [scrollTargetLockId, runProgrammaticScroll]);

  const prevThreadScrollKeyRef = useRef<string | null | undefined>(undefined);
  const lastOpenPaintGenerationRef = useRef(0);
  const restoredScrollThreadRef = useRef<string | null>(null);

  const applyOpenScrollFromDecision = useCallback(
    (decision: ThreadInitialScroll, snapshot: ChatMessage[]) => {
      if (!messagesContainerRef.current) return;
      if ('atBottom' in decision && decision.atBottom) {
        runProgrammaticScroll(() => {
          pinBottomAfterLayout();
        }, PROGRAMMATIC_SCROLL_HOLD_FRAMES);
        return;
      }
      const anchorId = 'anchorMessageId' in decision ? decision.anchorMessageId : undefined;
      if (!anchorId) return;
      const savedOffset = 'anchorOffsetPx' in decision ? decision.anchorOffsetPx : undefined;
      const anchorOffsetPx = savedOffset != null && Number.isFinite(savedOffset) ? savedOffset : 0;
      const idx = snapshot.findIndex((m) => m.id === anchorId);
      if (idx < 0) {
        runProgrammaticScroll(() => {
          pinBottomAfterLayout();
        }, PROGRAMMATIC_SCROLL_HOLD_FRAMES);
        return;
      }

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
        runProgrammaticScroll(() => {
          const container = messagesContainerRef.current!;
          container.scrollTop += anchorEl.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientTop - anchorOffsetPx;
        });
        requestAnimationFrame(highlightIfDeepLink);
        return;
      }
      runProgrammaticScroll(() => {
        const item = virtualizerRef.current.measurementsCache[idx];
        if (!item) return;
        virtualizerRef.current.scrollToOffset(item.start + (innerListRef.current?.offsetTop ?? 0) - anchorOffsetPx, {
          align: 'start', behavior: 'auto',
        });
      });
      requestAnimationFrame(highlightIfDeepLink);
    },
    [highlightAnchorMessageId, reduceMotion, runProgrammaticScroll, pinBottomAfterLayout]
  );

  useLayoutEffect(() => {
    if (prevThreadScrollKeyRef.current !== threadScrollKey) {
      prevThreadScrollKeyRef.current = threadScrollKey;
      restoredScrollThreadRef.current = null;
      lastOpenPaintGenerationRef.current = 0;
      // Do not force scrollTop=0 here — that flashes mid-list then pin-to-bottom on open.
    }
    // Paint-generation bumps enrich the same thread (network hydrate). Do not clear
    // restoredScrollThreadRef — re-applying open-at-bottom yanks users reading history.
    if (openPaintGeneration !== lastOpenPaintGenerationRef.current) {
      lastOpenPaintGenerationRef.current = openPaintGeneration;
    }
    if (!threadScrollKey) return;
    if (isSwitchingChatType || messages.length === 0) return;
    if (!messagesContainerRef.current) return;
    if (restoredScrollThreadRef.current === threadScrollKey) return;
    if (initialScroll === undefined) return;

    const wantsAtBottom = 'atBottom' in initialScroll && initialScroll.atBottom;
    if (
      wantsAtBottom &&
      userReleasedBottomIntentRef.current
    ) {
      restoredScrollThreadRef.current = threadScrollKey;
      return;
    }

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

  const scrollToBottomAlign = useCallback(() => {
    runProgrammaticScroll(() => {
      pinBottomAfterLayout();
    }, PROGRAMMATIC_SCROLL_HOLD_FRAMES);
  }, [runProgrammaticScroll, pinBottomAfterLayout]);

  const scrollToBottomSmooth = useCallback(() => {
    runProgrammaticScroll(() => {
      pinMessageListContainerToBottom(messagesContainerRef.current, { behavior: 'smooth' });
    }, PROGRAMMATIC_SCROLL_HOLD_FRAMES);
  }, [runProgrammaticScroll]);

  useLayoutEffect(() => {
    if (
      !layoutSettlingForBottomPin ||
      messages.length === 0 ||
      initialScroll === undefined ||
      !openScrollAtBottomRef.current ||
      scrollTargetLockId
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
  }, [layoutSettlingForBottomPin, messages.length, threadScrollKey, initialScroll, schedulePinToBottom, scrollTargetLockId]);

  useLayoutEffect(() => {
    if (!openScrollAtBottomRef.current || scrollTargetLockId) return;
    if (!layoutSettlingForBottomPin) return;
    schedulePinToBottom();
  }, [virtualMeasureKey, layoutSettlingForBottomPin, schedulePinToBottom, scrollTargetLockId]);

  const prevLayoutSettlingRef = useRef(layoutSettlingForBottomPin);
  useLayoutEffect(() => {
    const wasSettling = prevLayoutSettlingRef.current;
    prevLayoutSettlingRef.current = layoutSettlingForBottomPin;
    if (!wasSettling || layoutSettlingForBottomPin || scrollTargetLockId) return;
    const el = messagesContainerRef.current;
    const nearBottom = el ? isMessageListNearBottom(el, MESSAGE_LIST_NEAR_BOTTOM_PX) : false;
    if (
      shouldPinAfterSettlingEnds({
        openAtBottom: openScrollAtBottomRef.current,
        nearBottom,
      })
    ) {
      scrollToBottomAlign();
      return;
    }
    if (openScrollAtBottomRef.current && !nearBottom) {
      releaseBottomIntent();
    }
  }, [layoutSettlingForBottomPin, scrollTargetLockId, scrollToBottomAlign, releaseBottomIntent]);

  const viewportMetricsRef = useRef({ scrollTop: 0, scrollHeight: 0, primed: false });
  useEffect(() => {
    viewportMetricsRef.current = { scrollTop: 0, scrollHeight: 0, primed: false };
  }, [threadScrollKey]);

  useEffect(() => {
    return containerEvents.subscribe(() => {
      const el = messagesContainerRef.current;
      if (!el) return;
      const nearBottom = isMessageListNearBottom(el, MESSAGE_LIST_NEAR_BOTTOM_PX);
      const prev = viewportMetricsRef.current;
      const scrollMoved = prev.primed && Math.abs(el.scrollTop - prev.scrollTop) > 1;
      const heightGrew = prev.primed && el.scrollHeight > prev.scrollHeight + 1;
      viewportMetricsRef.current = {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        primed: true,
      };
      const action = shouldReleaseBottomIntentOnViewportTick({
        layoutSettling: layoutSettlingRef.current,
        programmaticScroll: programmaticScrollRef.current,
        nearBottom,
        scrollMoved,
        heightGrew,
        openAtBottomIntent:
          openScrollAtBottomRef.current || wasAtBottomBeforeGrowRef.current,
      });
      if (action === 'release') {
        releaseBottomIntent();
        return;
      }
      if (action === 'repin') {
        runProgrammaticScroll(
          () => pinMessageListContainerToBottom(el),
          PROGRAMMATIC_SCROLL_HOLD_FRAMES
        );
        wasAtBottomBeforeGrowRef.current = true;
        return;
      }
      if (!layoutSettlingRef.current && !programmaticScrollRef.current) {
        wasAtBottomBeforeGrowRef.current = nearBottom;
      }
    });
  }, [containerEvents, releaseBottomIntent, runProgrammaticScroll]);

  useEffect(() => {
    if (!threadScrollKey) return;
    if (isSwitchingChatType || messages.length === 0) return;

    const tick = () => {
      if (threadScrollKey && restoredScrollThreadRef.current !== threadScrollKey) return;
      const el = messagesContainerRef.current;
      if (!el) return;
      if (layoutSettlingForBottomPin) return;
      const nearBottom = isMessageListNearBottom(el, MESSAGE_LIST_NEAR_BOTTOM_PX);
      const items = virtualizerRef.current.getVirtualItems();
      let anchorMessageId: string | null = null;
      let anchorOffsetPx: number | undefined;
      const listTop = innerListRef.current?.offsetTop ?? 0;
      for (const vi of items) {
        if (vi.index >= messagesForScrollRef.current.length || vi.end + listTop <= el.scrollTop) continue;
        const m = messagesForScrollRef.current[vi.index];
        if (m) {
          anchorMessageId = m.id;
          anchorOffsetPx = vi.start + listTop - el.scrollTop;
          break;
        }
      }
      scheduleThreadScrollSave(threadScrollKey, {
        atBottom: nearBottom,
        anchorMessageId: nearBottom ? null : anchorMessageId,
        ...(nearBottom ? {} : { anchorOffsetPx }),
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
      scrollVirtualizerToIndex(virtualizer, idx, { align: 'center', behavior: 'auto' });
    },
    [messages, virtualizer]
  );

  const initialSmoothScrollDoneRef = useRef(false);
  const prevIsInitialLoadRef = useRef(isInitialLoad);
  const prevIsLoadingMessagesRef = useRef(isLoadingMessages);

  useLayoutEffect(() => {
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
    if (scrollTargetLockId) return;
    if (layoutSettlingForBottomPin) return;
    if (!threadScrollKey) return;
    if (messages.length === 0) return;
    if (!openScrollAtBottomRef.current) {
      initialSmoothScrollDoneRef.current = true;
      return;
    }

    const container = messagesContainerRef.current;
    if (!container) return;

    const timer = setTimeout(() => {
      initialSmoothScrollDoneRef.current = true;
      if (layoutSettlingForBottomPinRef.current) return;
      const el = messagesContainerRef.current;
      if (!el) return;
      const nearBottom = isMessageListNearBottom(el, MESSAGE_LIST_NEAR_BOTTOM_PX);
      const pin = decideInitialLoadTailPin({
        openAtBottom: openScrollAtBottomRef.current,
        nearBottom,
      });
      if (pin === 'smooth') {
        scrollToBottomSmooth();
        return;
      }
      if (openScrollAtBottomRef.current && !nearBottom) {
        releaseBottomIntent();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [
    isInitialLoad,
    isLoadingMessages,
    threadScrollKey,
    messages.length,
    scrollToBottomSmooth,
    scrollTargetLockId,
    releaseBottomIntent,
    layoutSettlingForBottomPin,
  ]);

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
  const suppressLayoutMotion =
    isLoadingMore || justLoadedOlderMessagesRef.current || !!scrollTargetLockId;
  const { heightTransition, rowLayoutTransitionEnabled } = resolveMessageListLayoutMotion({
    reduceMotion,
    threadLayoutSettling,
    isNearBottom: isNearBottomRef.current,
    suppressMotion: suppressLayoutMotion,
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
