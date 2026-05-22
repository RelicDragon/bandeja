import { useCallback, useEffect, useRef } from 'react';

export interface DragPaintState<K> {
  isDragging: boolean;
  paintValue: boolean;
  lastKey: K | null;
}

export interface UseDragPaintReturn<K> {
  state: DragPaintState<K>;
  onPointerDown: (key: K, currentValue: boolean, e: React.PointerEvent) => void;
  onPointerEnter: (key: K, currentValue: boolean) => void;
}

const TAP_SLOP_PX = 10;
const DRAG_SLOP_PX = 6;

type Pending<K> = {
  key: K;
  currentValue: boolean;
  startX: number;
  startY: number;
  pointerId: number;
};

type Dragging<K> = {
  paintValue: boolean;
  lastKey: K;
  pointerId: number;
};

function isScrollIntent(dx: number, dy: number): boolean {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  return ady > TAP_SLOP_PX && ady > adx * 1.25;
}

function isDragIntent(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_SLOP_PX && !isScrollIntent(dx, dy);
}

export function useDragPaint<K>(
  onPaint: (key: K, value: boolean) => void
): UseDragPaintReturn<K> {
  const onPaintRef = useRef(onPaint);
  onPaintRef.current = onPaint;

  const pendingRef = useRef<Pending<K> | null>(null);
  const draggingRef = useRef<Dragging<K> | null>(null);
  const scrollCancelledRef = useRef(false);

  const stateRef = useRef<DragPaintState<K>>({
    isDragging: false,
    paintValue: true,
    lastKey: null,
  });

  const syncDraggingState = useCallback((dragging: Dragging<K> | null) => {
    stateRef.current = dragging
      ? { isDragging: true, paintValue: dragging.paintValue, lastKey: dragging.lastKey }
      : { isDragging: false, paintValue: true, lastKey: null };
  }, []);

  const clearSession = useCallback(() => {
    pendingRef.current = null;
    draggingRef.current = null;
    scrollCancelledRef.current = false;
    syncDraggingState(null);
  }, [syncDraggingState]);

  const startDragging = useCallback(
    (pending: Pending<K>) => {
      const paintValue = !pending.currentValue;
      const dragging: Dragging<K> = {
        paintValue,
        lastKey: pending.key,
        pointerId: pending.pointerId,
      };
      pendingRef.current = null;
      draggingRef.current = dragging;
      syncDraggingState(dragging);
      onPaintRef.current(pending.key, paintValue);
    },
    [syncDraggingState]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pending = pendingRef.current;

      if (pending && e.pointerId === pending.pointerId) {
        const dx = e.clientX - pending.startX;
        const dy = e.clientY - pending.startY;
        if (isScrollIntent(dx, dy)) {
          scrollCancelledRef.current = true;
          pendingRef.current = null;
          return;
        }
        if (isDragIntent(dx, dy)) {
          startDragging(pending);
        }
        return;
      }

    };

    const onEnd = (e: PointerEvent) => {
      const pending = pendingRef.current;
      const dragging = draggingRef.current;

      if (pending && e.pointerId === pending.pointerId) {
        if (!scrollCancelledRef.current) {
          onPaintRef.current(pending.key, !pending.currentValue);
        }
        clearSession();
        return;
      }

      if (dragging && e.pointerId === dragging.pointerId) {
        clearSession();
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
  }, [clearSession, startDragging]);

  const onPointerDown = useCallback((key: K, currentValue: boolean, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    scrollCancelledRef.current = false;
    pendingRef.current = {
      key,
      currentValue,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
    };
    draggingRef.current = null;
    syncDraggingState(null);
  }, [syncDraggingState]);

  const onPointerEnter = useCallback((key: K, currentValue: boolean) => {
    const pending = pendingRef.current;
    if (pending && pending.key !== key) {
      startDragging(pending);
    }

    const dragging = draggingRef.current;
    if (!dragging) return;
    if (dragging.lastKey === key) return;
    if (currentValue === dragging.paintValue) {
      dragging.lastKey = key;
      stateRef.current = { ...stateRef.current, lastKey: key };
      return;
    }
    dragging.lastKey = key;
    stateRef.current = { ...stateRef.current, lastKey: key };
    onPaintRef.current(key, dragging.paintValue);
  }, [startDragging]);

  return {
    state: stateRef.current,
    onPointerDown,
    onPointerEnter,
  };
}
