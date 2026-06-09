import { useLayoutEffect, useRef } from 'react';
import { isMessageListNearBottom } from '@/utils/messageListScroll';

const SCROLL_IDLE_MS = 180;
const NEAR_BOTTOM_PX = 120;

type UseMessageListScrollAnchorParams = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  totalSize: number;
  isLoadingMoreRef: React.RefObject<boolean>;
};

/**
 * When the virtual list total height changes from row remeasurement, preserve the
 * user's scroll position (unless at top/bottom or actively scrolling).
 */
export function useMessageListScrollAnchor({
  containerRef,
  totalSize,
  isLoadingMoreRef,
}: UseMessageListScrollAnchorParams): void {
  const prevTotalSizeRef = useRef(0);
  const scrollIdleRef = useRef(true);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      scrollIdleRef.current = false;
      if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
      scrollIdleTimerRef.current = setTimeout(() => {
        scrollIdleRef.current = true;
      }, SCROLL_IDLE_MS);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
    };
  }, [containerRef]);

  useLayoutEffect(() => {
    const prev = prevTotalSizeRef.current;
    prevTotalSizeRef.current = totalSize;
    if (prev <= 0 || prev === totalSize) return;

    const container = containerRef.current;
    if (!container || isLoadingMoreRef.current) return;
    if (!scrollIdleRef.current || container.scrollTop <= 0) return;
    if (isMessageListNearBottom(container, NEAR_BOTTOM_PX)) return;

    const delta = totalSize - prev;
    if (delta === 0) return;
    container.scrollTop = Math.max(0, container.scrollTop + delta);
  }, [totalSize, containerRef, isLoadingMoreRef]);
}
