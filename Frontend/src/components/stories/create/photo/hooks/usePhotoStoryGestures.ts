import { useCallback, useRef, useState } from 'react';
import { useGesture } from '@use-gesture/react';
import type { Transform2D } from '../types';
import { clampLayerTransform, clampMediaTransform, snapRotation } from '../utils/transform';

export type PhotoStoryGestureTarget =
  | { kind: 'media'; transform: Transform2D; coverScale: number }
  | { kind: 'layer'; transform: Transform2D }
  | { kind: 'off' };

type UsePhotoStoryGesturesOptions = {
  target: PhotoStoryGestureTarget;
  stageScale: number;
  onMediaTransformChange: (next: Transform2D) => void;
  onLayerTransformChange: (next: Transform2D) => void;
  onMediaReset: () => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
};

export function usePhotoStoryGestures({
  target,
  stageScale,
  onMediaTransformChange,
  onLayerTransformChange,
  onMediaReset,
  onGestureStart,
  onGestureEnd,
}: UsePhotoStoryGesturesOptions) {
  const targetRef = useRef(target);
  targetRef.current = target;

  const pinchStartRef = useRef<{ scale: number; rotation: number } | null>(null);
  const gestureActiveRef = useRef(false);
  const [isGestureActive, setIsGestureActive] = useState(false);

  const setGestureActive = useCallback(
    (active: boolean) => {
      if (gestureActiveRef.current === active) return;
      gestureActiveRef.current = active;
      setIsGestureActive(active);
      if (active) onGestureStart?.();
      else onGestureEnd?.();
    },
    [onGestureEnd, onGestureStart]
  );

  const toCanvasDelta = useCallback(
    (dx: number, dy: number) => ({
      x: dx / stageScale,
      y: dy / stageScale,
    }),
    [stageScale]
  );

  const applyMedia = useCallback(
    (next: Transform2D, snapRotation = true) => {
      const t = targetRef.current;
      if (t.kind !== 'media') return;
      onMediaTransformChange(
        clampMediaTransform(next, t.coverScale, snapRotation ? undefined : { snapRotation: false })
      );
    },
    [onMediaTransformChange]
  );

  const applyLayer = useCallback(
    (next: Transform2D) => {
      if (targetRef.current.kind !== 'layer') return;
      onLayerTransformChange(clampLayerTransform(next));
    },
    [onLayerTransformChange]
  );

  const bind = useGesture(
    {
      onDrag: ({ movement: [mx, my], pinching, cancel, first, last, memo }) => {
        const t = targetRef.current;
        if (t.kind === 'off' || t.kind === 'layer' || pinching) {
          cancel();
          return memo;
        }
        if (first) {
          setGestureActive(true);
          return { x: t.transform.x, y: t.transform.y };
        }
        const start = memo as { x: number; y: number };
        const delta = toCanvasDelta(mx, my);
        applyMedia({
          ...t.transform,
          x: start.x + delta.x,
          y: start.y + delta.y,
        });
        if (last) setGestureActive(false);
        return memo;
      },
      onPinch: ({ offset: [scaleMul, angleDelta], first, last, memo }) => {
        const t = targetRef.current;
        if (t.kind === 'off') return memo;
        if (first || !pinchStartRef.current) {
          setGestureActive(true);
          pinchStartRef.current = {
            scale: t.transform.scale,
            rotation: t.transform.rotation,
          };
        }
        const start = pinchStartRef.current;
        const baseScale = start?.scale ?? t.transform.scale;
        const baseRotation = start?.rotation ?? t.transform.rotation;
        const nextRotation = last
          ? snapRotation(baseRotation + angleDelta)
          : baseRotation + angleDelta;
        const next = {
          ...t.transform,
          scale: baseScale * scaleMul,
          rotation: nextRotation,
        };
        if (t.kind === 'media') applyMedia(next, last);
        else applyLayer(next);
        if (last) setGestureActive(false);
        return memo;
      },
      onPinchEnd: () => {
        pinchStartRef.current = null;
        setGestureActive(false);
      },
      onDoubleClick: () => {
        if (targetRef.current.kind === 'media') onMediaReset();
      },
    },
    {
      eventOptions: { passive: false },
      drag: { filterTaps: true },
      pinch: { rubberband: true, scaleBounds: { min: 0.2, max: 8 } },
      enabled: target.kind !== 'off',
    }
  );

  return { bind, isGestureActive };
}
