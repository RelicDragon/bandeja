import { useState, useRef, useCallback } from 'react';

interface UseColumnResizeOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
}

export function useColumnResize({ initialWidth, minWidth, maxWidth }: UseColumnResizeOptions) {
  const [width, setWidth] = useState(initialWidth);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [width]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const diff = e.clientX - startXRef.current;
    setWidth(Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + diff)));
  }, [minWidth, maxWidth]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return {
    width,
    isDragging: draggingRef,
    splitterProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
    },
  };
}
