import { useLayoutEffect, useRef } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import { isMessageListNearBottom } from '@/utils/messageListScroll';
import {
  snapshotMeasurements,
  sumSizeDeltaAboveScrollTop,
  type MeasurementSnapshot,
} from '@/utils/messageListScrollAnchor';

const NEAR_BOTTOM_PX = 120;

type UseMessageListScrollAnchorParams = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  isLoadingMoreRef: React.RefObject<boolean>;
  threadScrollKey: string | null;
  measurementRevision: number;
};

/**
 * When row heights change (measure or estimate), preserve scroll for rows above the viewport.
 * Uses per-row deltas — not total list height — so tail-only growth does not yank mid-history readers.
 */
export function useMessageListScrollAnchor({
  containerRef,
  virtualizer,
  isLoadingMoreRef,
  threadScrollKey,
  measurementRevision,
}: UseMessageListScrollAnchorParams): void {
  const prevMeasurementsRef = useRef<MeasurementSnapshot | null>(null);

  useLayoutEffect(() => {
    prevMeasurementsRef.current = null;
  }, [threadScrollKey]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || isLoadingMoreRef.current) return;
    if (container.scrollTop <= 0) return;
    if (isMessageListNearBottom(container, NEAR_BOTTOM_PX)) return;

    const measurements = virtualizer.measurementsCache;
    const next = snapshotMeasurements(measurements);
    const prev = prevMeasurementsRef.current;
    prevMeasurementsRef.current = next;

    if (!prev || prev.length === 0) return;

    const scrollTop = container.scrollTop;
    const delta = sumSizeDeltaAboveScrollTop(prev, next, scrollTop);
    if (delta === 0) return;

    container.scrollTop = Math.max(0, scrollTop + delta);
  }, [virtualizer, containerRef, isLoadingMoreRef, measurementRevision]);
}
