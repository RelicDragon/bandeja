import { useCallback, useRef } from 'react';

type StoriesGestureLayerProps = {
  onTapLeft: () => void;
  onTapRight: () => void;
  onLongPressStart: () => void;
  onLongPressEnd: () => void;
  onSwipeDown: () => void;
  onSwipeUp?: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onDoubleTap?: (x: number, y: number) => void;
  reducedMotion?: boolean;
  className?: string;
  children: React.ReactNode;
};

const LONG_PRESS_MS = 250;
const LONG_PRESS_MS_REDUCED = 150;
const SWIPE_THRESHOLD = 60;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_DISTANCE_PX = 24;

function isStoryInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('button, a, input, textarea, select, [data-story-interactive]'));
}

export function StoriesGestureLayer({
  onTapLeft,
  onTapRight,
  onLongPressStart,
  onLongPressEnd,
  onSwipeDown,
  onSwipeUp,
  onSwipeLeft,
  onSwipeRight,
  onDoubleTap,
  reducedMotion = false,
  className,
  children,
}: StoriesGestureLayerProps) {
  const longPressMs = reducedMotion ? LONG_PRESS_MS_REDUCED : LONG_PRESS_MS;
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressActive = useRef(false);
  const skipGestureRef = useRef(false);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (longPressActive.current) {
      longPressActive.current = false;
      onLongPressEnd();
    }
  }, [onLongPressEnd]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      skipGestureRef.current = isStoryInteractiveTarget(e.target);
      if (skipGestureRef.current) return;
      touchStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
      longPressTimer.current = setTimeout(() => {
        longPressActive.current = true;
        onLongPressStart();
      }, longPressMs);
    },
    [onLongPressStart, longPressMs]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (skipGestureRef.current) {
        skipGestureRef.current = false;
        touchStart.current = null;
        clearLongPress();
        return;
      }
      const start = touchStart.current;
      clearLongPress();
      touchStart.current = null;
      if (!start || longPressActive.current) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const elapsed = Date.now() - start.t;

      if (Math.abs(dy) > SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
        if (dy > 0) onSwipeDown();
        else onSwipeUp?.();
        return;
      }
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) onSwipeLeft();
        else onSwipeRight();
        return;
      }
      if (elapsed > 400) return;

      const now = Date.now();
      const prevTap = lastTapRef.current;
      lastTapRef.current = { t: now, x: e.clientX, y: e.clientY };
      if (
        onDoubleTap &&
        prevTap &&
        now - prevTap.t <= DOUBLE_TAP_MS &&
        Math.hypot(e.clientX - prevTap.x, e.clientY - prevTap.y) <= DOUBLE_TAP_DISTANCE_PX
      ) {
        lastTapRef.current = null;
        onDoubleTap(e.clientX, e.clientY);
        return;
      }

      const width = e.currentTarget.clientWidth || window.innerWidth;
      const ratio = e.clientX / width;
      if (ratio < 1 / 3) onTapLeft();
      else onTapRight();
    },
    [clearLongPress, onSwipeDown, onSwipeUp, onSwipeLeft, onSwipeRight, onTapLeft, onTapRight, onDoubleTap]
  );

  return (
    <div
      className={className ?? 'relative flex-1 min-h-0 touch-none select-none'}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={clearLongPress}
      onPointerLeave={clearLongPress}
    >
      {children}
    </div>
  );
}
