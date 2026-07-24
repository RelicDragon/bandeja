import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { ChatMessage } from '@/api/chat';
import { decideNewMessagesScrollApply } from '@/services/chat/threadScrollPolicy';
import { pinMessageListContainerToBottom } from '@/utils/messageListScroll';
import {
  applyPrependScrollCompensation,
  applyPrependScrollHeightGrowth,
  capturePrependScrollSnapshot,
  detectPrependReconcile,
  type PrependScrollSnapshot,
} from './messageListPrependCompensation';

type UseMessageListPrependCompensationParams = {
  containerRef: RefObject<HTMLDivElement | null>;
  messages: ChatMessage[];
  isLoadingMore: boolean;
  isLoadingMoreRef: RefObject<boolean>;
  threadScrollKey: string | null;
  layoutSettlingForBottomPin: boolean;
  wasAtBottomBeforeGrowRef: RefObject<boolean>;
  isNearBottomRef: RefObject<boolean>;
  scrollTargetLockId?: string | null;
};

type UseMessageListPrependCompensationResult = {
  justLoadedOlderMessagesRef: RefObject<boolean>;
  prependCompensationEpochRef: RefObject<number>;
};

/**
 * Unified prepend scroll compensation: snapshot before prepend, single layout-pass delta.
 * Policy (`threadScrollPolicy`) decides when; this hook owns how.
 */
export function useMessageListPrependCompensation({
  containerRef,
  messages,
  isLoadingMore,
  isLoadingMoreRef,
  threadScrollKey,
  layoutSettlingForBottomPin,
  wasAtBottomBeforeGrowRef,
  isNearBottomRef,
  scrollTargetLockId = null,
}: UseMessageListPrependCompensationParams): UseMessageListPrependCompensationResult {
  const previousMessageCountRef = useRef(0);
  const previousFirstMessageIdRef = useRef<string | undefined>(undefined);
  const prependSnapshotRef = useRef<PrependScrollSnapshot | null>(null);
  const justLoadedOlderMessagesRef = useRef(false);
  const prependCompensationEpochRef = useRef(0);

  useLayoutEffect(() => {
    previousMessageCountRef.current = 0;
    previousFirstMessageIdRef.current = undefined;
    prependSnapshotRef.current = null;
    justLoadedOlderMessagesRef.current = false;
  }, [threadScrollKey]);

  useLayoutEffect(() => {
    if (!isLoadingMore) return;
    const container = containerRef.current;
    if (!container) return;
    prependSnapshotRef.current = capturePrependScrollSnapshot(container);
    justLoadedOlderMessagesRef.current = false;
  }, [isLoadingMore, containerRef]);

  useEffect(() => {
    const wasLoading = isLoadingMoreRef.current;
    isLoadingMoreRef.current = isLoadingMore;

    if (!isLoadingMore && wasLoading) {
      justLoadedOlderMessagesRef.current = true;
      setTimeout(() => {
        justLoadedOlderMessagesRef.current = false;
      }, 500);
    }
  }, [isLoadingMore, isLoadingMoreRef]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const currentMessageCount = messages.length;
    const previousMessageCount = previousMessageCountRef.current;
    const isNewMessagesAdded = currentMessageCount > previousMessageCount;
    const previousFirstId = previousFirstMessageIdRef.current;
    const currentFirstId = messages[0]?.id;

    if (!isNewMessagesAdded) {
      previousMessageCountRef.current = currentMessageCount;
      previousFirstMessageIdRef.current = currentFirstId;
      if (!isLoadingMore) {
        prependSnapshotRef.current = capturePrependScrollSnapshot(container);
        wasAtBottomBeforeGrowRef.current = isNearBottomRef.current;
      }
      return;
    }

    const wasLoadingMore = isLoadingMoreRef.current || isLoadingMore;
    const justLoadedOlder = justLoadedOlderMessagesRef.current;
    const isPrependReconcile = detectPrependReconcile({
      previousMessageCount,
      previousFirstId,
      currentFirstId,
      wasLoadingMore,
      justLoadedOlder,
    });

    const scrollDecision = decideNewMessagesScrollApply({
      isNewMessagesAdded: true,
      wasLoadingMore: wasLoadingMore || isLoadingMoreRef.current,
      justLoadedOlder,
      isPrependReconcile,
      layoutSettlingForBottomPin,
      wasAtBottom: scrollTargetLockId ? false : wasAtBottomBeforeGrowRef.current,
    });

    if (scrollDecision.kind === 'prepend-compensate') {
      if (!scrollTargetLockId) {
        const snapshot =
          prependSnapshotRef.current ?? capturePrependScrollSnapshot(container);
        applyPrependScrollCompensation(container, snapshot);
        prependCompensationEpochRef.current += 1;
        prependSnapshotRef.current = capturePrependScrollSnapshot(container);
        const heightAfter = container.scrollHeight;
        // Virtualizer/estimates may settle one frame later — grow from *current* scrollTop.
        requestAnimationFrame(() => {
          const el = containerRef.current;
          if (!el) return;
          applyPrependScrollHeightGrowth(el, heightAfter);
          prependSnapshotRef.current = capturePrependScrollSnapshot(el);
        });
      }
    } else if (
      scrollDecision.kind === 'append-pin-if-at-bottom' &&
      messages.length > 0 &&
      !scrollTargetLockId
    ) {
      pinMessageListContainerToBottom(container);
    }

    if (
      !isNewMessagesAdded ||
      !(isLoadingMoreRef.current || isLoadingMore || justLoadedOlderMessagesRef.current)
    ) {
      wasAtBottomBeforeGrowRef.current =
        scrollDecision.kind === 'append-pin-if-at-bottom' ? true : isNearBottomRef.current;
    }

    previousMessageCountRef.current = currentMessageCount;
    previousFirstMessageIdRef.current = currentFirstId;
    if (!isLoadingMore) {
      prependSnapshotRef.current = capturePrependScrollSnapshot(container);
    }
  }, [
    messages,
    isLoadingMore,
    layoutSettlingForBottomPin,
    containerRef,
    isLoadingMoreRef,
    wasAtBottomBeforeGrowRef,
    isNearBottomRef,
    scrollTargetLockId,
  ]);

  return { justLoadedOlderMessagesRef, prependCompensationEpochRef };
}
