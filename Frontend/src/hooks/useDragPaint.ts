import { useCallback, useEffect, useRef, useState } from 'react';

export interface DragPaintState<K> {
  isDragging: boolean;
  paintValue: boolean;
  lastKey: K | null;
}

export interface UseDragPaintReturn<K> {
  state: DragPaintState<K>;
  onPointerDown: (key: K, currentValue: boolean) => void;
  onPointerEnter: (key: K, currentValue: boolean) => void;
}

export function useDragPaint<K>(
  onPaint: (key: K, value: boolean) => void
): UseDragPaintReturn<K> {
  const [state, setState] = useState<DragPaintState<K>>({
    isDragging: false,
    paintValue: true,
    lastKey: null,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const end = () => setState((s) => (s.isDragging ? { ...s, isDragging: false, lastKey: null } : s));
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, []);

  const onPointerDown = useCallback(
    (key: K, currentValue: boolean) => {
      const nextVal = !currentValue;
      setState({ isDragging: true, paintValue: nextVal, lastKey: key });
      onPaint(key, nextVal);
    },
    [onPaint]
  );

  const onPointerEnter = useCallback(
    (key: K, currentValue: boolean) => {
      const s = stateRef.current;
      if (!s.isDragging) return;
      if (s.lastKey === key) return;
      if (currentValue === s.paintValue) {
        stateRef.current = { ...s, lastKey: key };
        setState(stateRef.current);
        return;
      }
      stateRef.current = { ...s, lastKey: key };
      setState(stateRef.current);
      onPaint(key, s.paintValue);
    },
    [onPaint]
  );

  return { state, onPointerDown, onPointerEnter };
}
