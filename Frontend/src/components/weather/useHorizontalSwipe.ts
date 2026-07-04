import { useEffect, useRef, type RefObject } from 'react';

interface UseHorizontalSwipeOptions {
  /** Minimum horizontal travel in px to count as a swipe. */
  threshold?: number;
  /** Called when the finger swipes left (moves towards the next item). */
  onSwipeLeft: () => void;
  /** Called when the finger swipes right (moves towards the previous item). */
  onSwipeRight: () => void;
  /** When false, no listeners are attached. Defaults to true. */
  enabled?: boolean;
}

/**
 * Detects horizontal swipe gestures on an element while leaving vertical
 * scrolling and taps untouched. Listeners are passive and never call
 * preventDefault, so nested scroll containers keep their native momentum
 * scroll and clicks fire normally for taps.
 */
export function useHorizontalSwipe<T extends HTMLElement>(
  ref: RefObject<T | null>,
  { threshold = 50, onSwipeLeft, onSwipeRight, enabled = true }: UseHorizontalSwipeOptions,
): void {
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const trackingRef = useRef(false);

  // Keep the latest callbacks without forcing listener re-attachment each render.
  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);
  useEffect(() => {
    onSwipeLeftRef.current = onSwipeLeft;
  });
  useEffect(() => {
    onSwipeRightRef.current = onSwipeRight;
  });

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        trackingRef.current = false;
        return;
      }
      trackingRef.current = true;
      startXRef.current = event.touches[0].clientX;
      startYRef.current = event.touches[0].clientY;
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!trackingRef.current) return;
      trackingRef.current = false;
      const touch = event.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - startXRef.current;
      const deltaY = touch.clientY - startYRef.current;
      if (Math.abs(deltaX) < threshold) return;
      // Ignore vertical-dominant gestures so list scrolling wins.
      if (Math.abs(deltaX) <= Math.abs(deltaY)) return;

      if (deltaX < 0) onSwipeLeftRef.current();
      else onSwipeRightRef.current();
    };

    const handleTouchCancel = () => {
      trackingRef.current = false;
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    element.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [ref, enabled, threshold]);
}
