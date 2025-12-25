import { useState, useRef, useEffect, useCallback } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

export const usePullToRefresh = ({ 
  onRefresh, 
  threshold = 80,
  disabled = false 
}: UsePullToRefreshOptions) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);
  const elementRef = useRef<HTMLElement | null>(null);
  const isWindowScroll = useRef<boolean>(false);

  const isAtTop = useCallback(() => {
    if (elementRef.current) {
      return elementRef.current.scrollTop <= 5;
    }
    if (isWindowScroll.current) {
      return window.scrollY <= 5;
    }
    return false;
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing) return;
    
    const target = e.target as HTMLElement;
    const scrollableElement = target.closest('.overflow-y-auto') as HTMLElement;
    
    if (scrollableElement && scrollableElement.scrollTop <= 5) {
      startY.current = e.touches[0].clientY;
      elementRef.current = scrollableElement;
      isWindowScroll.current = false;
    } else if (window.scrollY <= 5) {
      startY.current = e.touches[0].clientY;
      elementRef.current = null;
      isWindowScroll.current = true;
    }
  }, [disabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing || !startY.current) return;
    
    if (!isAtTop()) {
      setPullDistance(0);
      startY.current = 0;
      elementRef.current = null;
      isWindowScroll.current = false;
      return;
    }
    
    currentY.current = e.touches[0].clientY;
    const distance = currentY.current - startY.current;
    
    if (distance > 0) {
      const pullAmount = Math.min(distance, threshold * 2);
      setPullDistance(pullAmount);
      if (pullAmount > 10) {
        e.preventDefault();
      }
    } else {
      setPullDistance(0);
    }
  }, [disabled, isRefreshing, threshold, isAtTop]);

  const handleTouchEnd = useCallback(async () => {
    if (disabled || isRefreshing || !startY.current) return;
    
    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
    
    startY.current = 0;
    currentY.current = 0;
    elementRef.current = null;
    isWindowScroll.current = false;
  }, [disabled, isRefreshing, pullDistance, threshold, onRefresh]);

  useEffect(() => {
    if (disabled) return;

    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [disabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    isRefreshing,
    pullDistance,
    pullProgress: Math.min(pullDistance / threshold, 1),
  };
};

