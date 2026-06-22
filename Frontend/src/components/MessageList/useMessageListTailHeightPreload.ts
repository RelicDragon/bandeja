import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { ChatMessage } from '@/api/chat';
import {
  rowHeightCachePreloadTail,
  rowHeightCacheSeedTailHeuristics,
} from '@/services/chat/rowHeightCache';
import type { ThreadInitialScroll } from '@/services/chat/chatOpenScrollPolicy';
import {
  inferTailPreloadNearBottomOnOpen,
  readTailHeightPreloadNearBottom,
  shouldRunTailHeightPreload,
  TAIL_HEIGHT_PRELOAD_DEBOUNCE_MS,
  TAIL_HEIGHT_PRELOAD_LIMIT,
} from '@/services/chat/tailHeightPreloadPolicy';
import type { ThreadScrollContainerEvents } from './useThreadScrollContainerEvents';

type UseMessageListTailHeightPreloadParams = {
  containerRef: RefObject<HTMLDivElement | null>;
  messagesMeasureRef: RefObject<readonly ChatMessage[]>;
  threadScrollKey: string | null;
  tailIdsForHeightPreload: string;
  bumpHeightEstimates: () => void;
  openScrollAtBottomRef: RefObject<boolean>;
  layoutSettlingRef: RefObject<boolean>;
  initialScroll: ThreadInitialScroll | undefined;
  containerEvents: ThreadScrollContainerEvents;
};

export function useMessageListTailHeightPreload({
  containerRef,
  messagesMeasureRef,
  threadScrollKey,
  tailIdsForHeightPreload,
  bumpHeightEstimates,
  openScrollAtBottomRef,
  layoutSettlingRef,
  initialScroll,
  containerEvents,
}: UseMessageListTailHeightPreloadParams): void {
  const lastSeededTailKeyRef = useRef('');
  const nearBottomRef = useRef(true);
  const pendingTailPreloadRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialScrollRef = useRef(initialScroll);
  initialScrollRef.current = initialScroll;

  const readNearBottomFromContainer = useCallback((el: HTMLDivElement) => {
    return readTailHeightPreloadNearBottom(
      el.scrollHeight,
      el.scrollTop,
      el.clientHeight,
      initialScrollRef.current
    );
  }, []);

  const allowsTailPreload = useCallback(
    () =>
      shouldRunTailHeightPreload({
        nearBottom: nearBottomRef.current,
        openAtBottom: openScrollAtBottomRef.current,
        layoutSettling: layoutSettlingRef.current,
      }),
    [openScrollAtBottomRef, layoutSettlingRef]
  );

  const runTailHeightSeed = useCallback(() => {
    if (tailIdsForHeightPreload.length === 0) return;
    if (tailIdsForHeightPreload === lastSeededTailKeyRef.current) return;
    lastSeededTailKeyRef.current = tailIdsForHeightPreload;
    if (rowHeightCacheSeedTailHeuristics(messagesMeasureRef.current.slice(-TAIL_HEIGHT_PRELOAD_LIMIT))) {
      bumpHeightEstimates();
    }
  }, [tailIdsForHeightPreload, messagesMeasureRef, bumpHeightEstimates]);

  const runTailHeightPreload = useCallback(() => {
    if (tailIdsForHeightPreload.length === 0) return;
    void rowHeightCachePreloadTail({
      messages: [...messagesMeasureRef.current],
      threadKey: threadScrollKey,
      limit: TAIL_HEIGHT_PRELOAD_LIMIT,
      shouldApply: allowsTailPreload,
    });
  }, [tailIdsForHeightPreload, messagesMeasureRef, threadScrollKey, allowsTailPreload]);

  const runTailHeightWork = useCallback(() => {
    runTailHeightSeed();
    runTailHeightPreload();
  }, [runTailHeightSeed, runTailHeightPreload]);

  const scheduleCatchUpAfterReturnToBottom = useCallback(() => {
    if (debounceTimerRef.current != null) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      if (!allowsTailPreload()) return;
      if (!pendingTailPreloadRef.current) return;
      pendingTailPreloadRef.current = false;
      lastSeededTailKeyRef.current = '';
      runTailHeightWork();
    }, TAIL_HEIGHT_PRELOAD_DEBOUNCE_MS);
  }, [allowsTailPreload, runTailHeightWork]);

  useLayoutEffect(() => {
    if (!threadScrollKey) return;
    lastSeededTailKeyRef.current = '';
    pendingTailPreloadRef.current = false;
    nearBottomRef.current = inferTailPreloadNearBottomOnOpen(initialScroll);
    const msgs = messagesMeasureRef.current;
    if (msgs.length > 0 && rowHeightCacheSeedTailHeuristics(msgs, msgs.length)) {
      bumpHeightEstimates();
    }
  }, [threadScrollKey, initialScroll, bumpHeightEstimates, messagesMeasureRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const refreshNearBottom = () => {
      const nearBottom = readNearBottomFromContainer(el);
      const wasNearBottom = nearBottomRef.current;
      nearBottomRef.current = nearBottom;

      if (nearBottom && !wasNearBottom) {
        scheduleCatchUpAfterReturnToBottom();
        return;
      }
      if (!nearBottom && wasNearBottom && debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };

    nearBottomRef.current = readNearBottomFromContainer(el);
    const unsubscribe = containerEvents.subscribe(refreshNearBottom);
    return () => {
      unsubscribe();
      if (debounceTimerRef.current != null) clearTimeout(debounceTimerRef.current);
    };
  }, [
    threadScrollKey,
    containerRef,
    containerEvents,
    scheduleCatchUpAfterReturnToBottom,
    readNearBottomFromContainer,
  ]);

  useLayoutEffect(() => {
    if (tailIdsForHeightPreload.length === 0) return;
    if (allowsTailPreload()) {
      pendingTailPreloadRef.current = false;
      runTailHeightWork();
      return;
    }
    pendingTailPreloadRef.current = true;
  }, [threadScrollKey, tailIdsForHeightPreload, allowsTailPreload, runTailHeightWork]);
}
