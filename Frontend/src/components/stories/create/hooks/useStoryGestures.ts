import { useCallback, useRef, useState } from 'react';
import { useGesture } from '@use-gesture/react';
import type { Transform2D } from '../types/storyEditor.types';
import { clampMediaTransform, snapRotation } from '../utils/storyTransform';

type UseStoryGesturesOptions = {
  transform: Transform2D;
  defaultTransform: Transform2D;
  stageScale: number;
  coverScale: number;
  onTransformChange: (next: Transform2D) => void;
  onReset: () => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  disabled?: boolean;
};

export function useStoryGestures({
  transform,
  defaultTransform,
  stageScale,
  coverScale,
  onTransformChange,
  onReset,
  onGestureStart,
  onGestureEnd,
  disabled = false,
}: UseStoryGesturesOptions) {
  const transformRef = useRef(transform);
  const defaultRef = useRef(defaultTransform);
  const coverScaleRef = useRef(coverScale);
  transformRef.current = transform;
  defaultRef.current = defaultTransform;
  coverScaleRef.current = coverScale;

  const applyTransform = useCallback(
    (next: Transform2D) => onTransformChange(clampMediaTransform(next, coverScaleRef.current)),
    [onTransformChange]
  );

  const pinchStartRef = useRef<{ scale: number; rotation: number } | null>(null);
  const gestureActiveRef = useRef(false);
  const [isMediaGestureActive, setIsMediaGestureActive] = useState(false);

  const setGestureActive = useCallback(
    (active: boolean) => {
      if (gestureActiveRef.current === active) return;
      gestureActiveRef.current = active;
      setIsMediaGestureActive(active);
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

  const bind = useGesture(
    {
      onDrag: ({ movement: [mx, my], pinching, cancel, first, last, memo }) => {
        if (disabled || pinching) {
          cancel();
          return memo;
        }
        if (first) {
          setGestureActive(true);
          return { x: transformRef.current.x, y: transformRef.current.y };
        }
        const start = memo as { x: number; y: number };
        const delta = toCanvasDelta(mx, my);
        applyTransform({
          ...transformRef.current,
          x: start.x + delta.x,
          y: start.y + delta.y,
        });
        if (last) setGestureActive(false);
        return memo;
      },
      onPinch: ({ offset: [scaleMul, angleDelta], first, last, memo, pinching: _pinching }) => {
        if (disabled) return memo;
        if (first || !pinchStartRef.current) {
          setGestureActive(true);
          pinchStartRef.current = {
            scale: transformRef.current.scale,
            rotation: transformRef.current.rotation,
          };
        }
        const start = pinchStartRef.current;
        const baseScale = start?.scale ?? transformRef.current.scale;
        const baseRotation = start?.rotation ?? transformRef.current.rotation;
        applyTransform({
          ...transformRef.current,
          scale: baseScale * scaleMul,
          rotation: last ? snapRotation(baseRotation + angleDelta) : baseRotation + angleDelta,
        });
        if (last) setGestureActive(false);
        return memo;
      },
      onPinchEnd: () => {
        pinchStartRef.current = null;
        setGestureActive(false);
      },
      onDoubleClick: () => {
        if (disabled) return;
        onReset();
      },
    },
    {
      drag: { filterTaps: true },
      pinch: { rubberband: true },
      enabled: !disabled,
    }
  );

  return { bind, isMediaGestureActive };
}
