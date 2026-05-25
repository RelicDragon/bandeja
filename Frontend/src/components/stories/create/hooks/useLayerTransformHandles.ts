import { useCallback, useRef, type PointerEvent, type RefObject } from 'react';
import type { Transform2D } from '../types/storyEditor.types';
import { angleDeg, distance, snapRotation } from '../utils/storyTransform';

export type LayerDragMode = 'move' | 'scale-br' | 'scale-bl' | 'scale-tr' | 'scale-tl' | 'rotate';

function pivotFromElement(el: HTMLElement | null): { cx: number; cy: number } | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
}

type UseLayerTransformHandlesOptions = {
  layerRef: RefObject<HTMLElement | null>;
  transform: Transform2D;
  stageScale: number;
  onTransformChange: (next: Transform2D) => void;
  onTransformBegin?: () => void;
  onTransformEnd?: () => void;
  disabled?: boolean;
};

export function useLayerTransformHandles({
  layerRef,
  transform,
  stageScale,
  onTransformChange,
  onTransformBegin,
  onTransformEnd,
  disabled = false,
}: UseLayerTransformHandlesOptions) {
  const dragRef = useRef<{
    mode: LayerDragMode;
    startTransform: Transform2D;
    startClient: { x: number; y: number };
    pivot: { cx: number; cy: number };
    startAngle?: number;
    startDist?: number;
  } | null>(null);

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLElement>, mode: LayerDragMode) => {
      if (disabled) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const pivot = pivotFromElement(layerRef.current);
      if (!pivot) return;
      onTransformBegin?.();
      const startAngle =
        mode === 'rotate' ? angleDeg(pivot.cx, pivot.cy, e.clientX, e.clientY) : undefined;
      const startDist = mode.startsWith('scale')
        ? distance(pivot.cx, pivot.cy, e.clientX, e.clientY)
        : undefined;
      dragRef.current = {
        mode,
        startTransform: { ...transform },
        startClient: { x: e.clientX, y: e.clientY },
        pivot,
        startAngle,
        startDist,
      };
    },
    [disabled, layerRef, onTransformBegin, transform]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      e.stopPropagation();

      const dx = (e.clientX - drag.startClient.x) / stageScale;
      const dy = (e.clientY - drag.startClient.y) / stageScale;
      const t = drag.startTransform;
      const { cx, cy } = drag.pivot;

      if (drag.mode === 'move') {
        onTransformChange({ ...t, x: t.x + dx, y: t.y + dy });
        return;
      }

      if (drag.mode === 'rotate' && drag.startAngle != null) {
        const currentAngle = angleDeg(cx, cy, e.clientX, e.clientY);
        onTransformChange({
          ...t,
          rotation: snapRotation(t.rotation + currentAngle - drag.startAngle),
        });
        return;
      }

      if (drag.mode.startsWith('scale') && drag.startDist != null && drag.startDist > 0) {
        const currentDist = distance(cx, cy, e.clientX, e.clientY);
        const ratio = currentDist / drag.startDist;
        onTransformChange({ ...t, scale: Math.max(0.35, Math.min(4, t.scale * ratio)) });
      }
    },
    [onTransformChange, stageScale]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const hadDrag = dragRef.current != null;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      if (hadDrag) onTransformEnd?.();
    },
    [onTransformEnd]
  );

  return { handlePointerDown, handlePointerMove, handlePointerUp };
}
