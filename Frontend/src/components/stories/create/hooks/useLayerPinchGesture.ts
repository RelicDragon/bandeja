import { useCallback, useRef } from 'react';
import { useGesture } from '@use-gesture/react';
import type { Transform2D } from '../types/storyEditor.types';
import { clampLayerTransform } from '../utils/storyTransform';

type UseLayerPinchGestureOptions = {
  transform: Transform2D;
  onTransformChange: (next: Transform2D) => void;
  onTransformBegin?: () => void;
  onTransformEnd?: () => void;
  enabled?: boolean;
};

export function useLayerPinchGesture({
  transform,
  onTransformChange,
  onTransformBegin,
  onTransformEnd,
  enabled = false,
}: UseLayerPinchGestureOptions) {
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const startScaleRef = useRef(1);

  const applyChange = useCallback(
    (next: Transform2D) => onTransformChange(clampLayerTransform(next)),
    [onTransformChange]
  );

  const bind = useGesture(
    {
      onPinch: ({ offset: [scaleMul], first, last }) => {
        if (!enabled) return;
        if (first) {
          startScaleRef.current = transformRef.current.scale;
          onTransformBegin?.();
        }
        applyChange({
          ...transformRef.current,
          scale: startScaleRef.current * scaleMul,
        });
        if (last) onTransformEnd?.();
      },
    },
    {
      enabled,
      pinch: { scaleBounds: { min: 0.35, max: 4 }, rubberband: true },
    }
  );

  return bind;
}
