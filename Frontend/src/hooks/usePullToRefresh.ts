import { useEffect, useState, useRef } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

export const usePullToRefresh = ({
  onRefresh,
  threshold = 60,
  disabled = false,
}: UsePullToRefreshOptions) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const touchStartY = useRef(0);
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

  useEffect(() => {
    if (disabled) return;

    const getScrollTop = () => {
      return Math.max(
        window.scrollY,
        window.pageYOffset,
        document.documentElement.scrollTop,
        document.body.scrollTop,
        0
      );
    };

    const isScrollableElement = (element: HTMLElement): boolean => {
      const style = window.getComputedStyle(element);
      const overflowY = style.overflowY;
      const hasScroll = element.scrollHeight > element.clientHeight;
      return (overflowY === 'auto' || overflowY === 'scroll') && hasScroll;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current) return;

      let target = e.target as HTMLElement;
      while (target && target !== document.body) {
        if (isScrollableElement(target) && target.scrollTop > 0) {
          canPullRef.current = false;
          isDraggingRef.current = false;
          return;
        }
        target = target.parentElement as HTMLElement;
      }

      const scrollTop = getScrollTop();
      const isAtTop = scrollTop === 0;
      
      touchStartY.current = e.touches[0].clientY;
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
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }

      const touchY = e.touches[0].clientY;
      const diff = touchY - touchStartY.current;

      if (diff > 5) {
        const resistance = 0.5;
        const distance = Math.min(diff * resistance, threshold * 2);
        pullDistanceRef.current = distance;
        setPullDistance(distance);

        if (distance > 10 && e.cancelable) {
          e.preventDefault();
        }
      } else if (diff < 0) {
        canPullRef.current = false;
        isDraggingRef.current = false;
        pullDistanceRef.current = 0;
        setPullDistance(0);
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
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }

      if (currentDistance >= threshold && !isRefreshingRef.current) {
        setIsRefreshing(true);
        pullDistanceRef.current = 100;
        setPullDistance(60);

        try {
          await onRefreshRef.current();
        } finally {
          setIsRefreshing(false);
          pullDistanceRef.current = 0;
          setPullDistance(0);
        }
      } else {
        pullDistanceRef.current = 0;
        setPullDistance(0);
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
