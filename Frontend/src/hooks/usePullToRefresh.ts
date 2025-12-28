import { useEffect, useState, useCallback, useRef } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

export const usePullToRefresh = ({
  onRefresh,
  threshold = 80,
  disabled = false,
}: UsePullToRefreshOptions) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  
  const touchStartY = useRef(0);
  const touchStartScrollY = useRef(0);
  const isDraggingRef = useRef(false);
  const canPullRef = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing) return;
    
    const isAtTop = window.scrollY === 0;
    touchStartY.current = e.touches[0].clientY;
    touchStartScrollY.current = window.scrollY;
    canPullRef.current = isAtTop;
    
    if (isAtTop) {
      isDraggingRef.current = true;
    }
  }, [disabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDraggingRef.current || !canPullRef.current || disabled || isRefreshing) return;

    const touchY = e.touches[0].clientY;
    const diff = touchY - touchStartY.current;

    if (window.scrollY > 0) {
      canPullRef.current = false;
      isDraggingRef.current = false;
      setPullDistance(0);
      return;
    }

    if (diff > 0 && window.scrollY === 0) {
      const resistance = 0.4;
      const distance = Math.min(diff * resistance, threshold * 2);
      setPullDistance(distance);

      if (distance > 10) {
        e.preventDefault();
      }
    } else if (diff < 0) {
      setPullDistance(0);
    }
  }, [disabled, isRefreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isDraggingRef.current || !canPullRef.current) {
      isDraggingRef.current = false;
      canPullRef.current = false;
      setPullDistance(0);
      return;
    }

    isDraggingRef.current = false;
    canPullRef.current = false;
    const currentDistance = pullDistance;

    if (currentDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(60);

      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [isRefreshing, onRefresh, pullDistance, threshold]);

  useEffect(() => {
    if (disabled) return;

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
  }, [disabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    isRefreshing,
    pullDistance,
    pullProgress: Math.min(pullDistance / threshold, 1),
  };
};
