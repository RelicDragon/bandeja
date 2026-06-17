import { useEffect, useState, useRef, RefObject } from 'react';
import { getAppScrollElement, getAppScrollTop } from '@/utils/appScroll';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  disabled?: boolean;
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

export const usePullToRefresh = ({
  onRefresh,
  threshold = 60,
  disabled = false,
  scrollContainerRef,
}: UsePullToRefreshOptions) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const touchStartScrollTop = useRef(0);
  const isDraggingRef = useRef(false);
  const canPullRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  const scrollContainerRefRef = useRef(scrollContainerRef);
  useEffect(() => {
    scrollContainerRefRef.current = scrollContainerRef;
  }, [scrollContainerRef]);

  const applyPullDistance = (distance: number) => {
    if (pullDistanceRef.current === distance) return;
    pullDistanceRef.current = distance;
    setPullDistance(distance);
  };

  useEffect(() => {
    if (disabled) return;

    const getScrollTop = () => {
      const container = scrollContainerRefRef.current?.current;
      if (container) return container.scrollTop;
      return getAppScrollTop();
    };

    const isScrollableElement = (element: HTMLElement): boolean => {
      const style = window.getComputedStyle(element);
      const overflowY = style.overflowY;
      const hasScroll = element.scrollHeight > element.clientHeight;
      return (overflowY === 'auto' || overflowY === 'scroll') && hasScroll;
    };

    const findScrollableAncestor = (target: HTMLElement): HTMLElement | null => {
      let node: HTMLElement | null = target;
      const preferred = scrollContainerRefRef.current?.current ?? null;
      while (node && node !== document.body) {
        if (isScrollableElement(node)) return node;
        node = node.parentElement;
      }
      return preferred ?? getAppScrollElement();
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current) return;

      const scrollable = findScrollableAncestor(e.target as HTMLElement);
      if (scrollable && scrollable.scrollTop > 0) {
        canPullRef.current = false;
        isDraggingRef.current = false;
        return;
      }

      const scrollTop = getScrollTop();
      const isAtTop = scrollTop === 0;

      touchStartY.current = e.touches[0].clientY;
      touchStartX.current = e.touches[0].clientX;
      touchStartScrollTop.current = scrollTop;
      canPullRef.current = isAtTop;
      isDraggingRef.current = isAtTop;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || !canPullRef.current || isRefreshingRef.current) return;

      const currentScrollTop = getScrollTop();
      
      if (currentScrollTop > 0 || touchStartScrollTop.current > 0) {
        canPullRef.current = false;
        isDraggingRef.current = false;
        applyPullDistance(0);
        return;
      }

      const touchY = e.touches[0].clientY;
      const touchX = e.touches[0].clientX;
      const diff = touchY - touchStartY.current;
      const diffX = Math.abs(touchX - touchStartX.current);

      if (diffX > Math.abs(diff) && diffX > 8) {
        isDraggingRef.current = false;
        applyPullDistance(0);
        return;
      }

      if (diff > 5) {
        const resistance = 0.5;
        const distance = Math.min(diff * resistance, threshold * 2);
        applyPullDistance(distance);

        if (distance > 10 && e.cancelable) {
          e.preventDefault();
        }
      } else if (diff < 0) {
        // Finger moving up — allow normal scroll, don't intercept.
        isDraggingRef.current = false;
        applyPullDistance(0);
      }
    };

    const handleTouchEnd = async () => {
      const wasDragging = isDraggingRef.current;
      const couldPull = canPullRef.current;
      const currentDistance = pullDistanceRef.current;
      const startedAtTop = touchStartScrollTop.current === 0;

      isDraggingRef.current = false;
      canPullRef.current = false;
      touchStartScrollTop.current = 0;

      if (!wasDragging || !couldPull || !startedAtTop) {
        applyPullDistance(0);
        return;
      }

      if (currentDistance >= threshold && !isRefreshingRef.current) {
        setIsRefreshing(true);
        applyPullDistance(60);

        try {
          await onRefreshRef.current();
        } finally {
          setIsRefreshing(false);
          applyPullDistance(0);
        }
      } else {
        applyPullDistance(0);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [disabled, threshold]);

  return {
    isRefreshing,
    pullDistance,
    pullProgress: Math.min(pullDistance / threshold, 1),
  };
};
