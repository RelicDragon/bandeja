import { useRef, type TouchEvent } from 'react';

const SWIPE_MIN_PX = 56;

/** Touch handlers that call `onStep(±1)` on a mostly-horizontal swipe. */
export function useDaySwipe(onStep: (delta: number) => void, enabled = true) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return;
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!enabled || !s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const rtl = document.documentElement.dir === 'rtl';
      onStep((dx < 0) !== rtl ? 1 : -1);
    },
  };
}
