import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import { isMessageListNearBottom, MESSAGE_LIST_NEAR_BOTTOM_PX } from '@/utils/messageListScroll';
import {
  snapshotMeasurements,
  sumSizeDeltaAboveScrollTop,
  type MeasurementSnapshot,
} from '@/utils/messageListScrollAnchor';

type UseMessageListScrollAnchorParams = {
  containerRef: RefObject<HTMLDivElement | null>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  isLoadingMoreRef: RefObject<boolean>;
  justLoadedOlderMessagesRef: RefObject<boolean>;
  prependCompensationEpochRef: RefObject<number>;
  threadScrollKey: string | null;
  measurementKey: string;
};

/**
 * When row heights change (measure or estimate), preserve scroll for rows above the viewport.
 * Skips prepend events — unified prepend compensation owns scrollTop for those.
 */
export function useMessageListScrollAnchor({
  containerRef,
  virtualizer,
  isLoadingMoreRef,
  justLoadedOlderMessagesRef,
  prependCompensationEpochRef,
  threadScrollKey,
  measurementKey,
}: UseMessageListScrollAnchorParams): void {
  const prevMeasurementsRef = useRef<MeasurementSnapshot | null>(null);
  const lastPrependEpochRef = useRef(0);

  useLayoutEffect(() => {
    prevMeasurementsRef.current = null;
    lastPrependEpochRef.current = prependCompensationEpochRef.current;
  }, [threadScrollKey, prependCompensationEpochRef]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || isLoadingMoreRef.current) return;
    if (justLoadedOlderMessagesRef.current) return;
    if (prependCompensationEpochRef.current !== lastPrependEpochRef.current) {
      lastPrependEpochRef.current = prependCompensationEpochRef.current;
      prevMeasurementsRef.current = snapshotMeasurements(virtualizer.measurementsCache);
      return;
    }
    if (container.scrollTop <= 0) return;
    if (isMessageListNearBottom(container, MESSAGE_LIST_NEAR_BOTTOM_PX)) return;

    const measurements = virtualizer.measurementsCache;
    const next = snapshotMeasurements(measurements);
    const prev = prevMeasurementsRef.current;
    prevMeasurementsRef.current = next;

    if (!prev || prev.length === 0) return;
    if (prev.length !== next.length) {
      return;
    }

    const scrollTop = container.scrollTop;
    const delta = sumSizeDeltaAboveScrollTop(prev, next, scrollTop);
    if (delta === 0) return;

    container.scrollTop = Math.max(0, scrollTop + delta);
  }, [
    virtualizer,
    containerRef,
    isLoadingMoreRef,
    justLoadedOlderMessagesRef,
    prependCompensationEpochRef,
    measurementKey,
  ]);
}
