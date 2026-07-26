import { useCallback, useRef, useState } from 'react';
import { useGesture } from '@use-gesture/react';
import type { Transform2D } from '../types';
import { clientToCanvasPoint, scaleMediaAroundCanvasPoint } from '../utils/mediaPinchMath';
import { clampLayerTransform, clampMediaTransform, snapRotation } from '../utils/transform';

export type PhotoStoryGestureTarget =
  | { kind: 'media'; transform: Transform2D; coverScale: number }
  | { kind: 'layer'; transform: Transform2D }
  | { kind: 'off' };

type UsePhotoStoryGesturesOptions = {
  target: PhotoStoryGestureTarget;
  stageScale: number;
  /** Frame rect in client coordinates — required for focal pinch / wheel zoom. */
  frameRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | null;
  onMediaTransformChange: (next: Transform2D) => void;
  onLayerTransformChange: (next: Transform2D) => void;
  onMediaReset: () => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  /** When true, skip drag/pinch so Konva transformer handles own the pointer. */
  handlesActive?: boolean;
};

function isEditableFieldTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export function usePhotoStoryGestures({
  target,
  stageScale,
  frameRect,
  onMediaTransformChange,
  onLayerTransformChange,
  onMediaReset,
  onGestureStart,
  onGestureEnd,
  handlesActive = false,
}: UsePhotoStoryGesturesOptions) {
  const targetRef = useRef(target);
  targetRef.current = target;
  const handlesActiveRef = useRef(handlesActive);
  handlesActiveRef.current = handlesActive;
  const stageScaleRef = useRef(stageScale);
  stageScaleRef.current = stageScale;
  const frameRectRef = useRef(frameRect);
  frameRectRef.current = frameRect;

  const pinchStartRef = useRef<{
    scale: number;
    rotation: number;
    x: number;
    y: number;
  } | null>(null);
  const gestureActiveRef = useRef(false);
  const wheelEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const toCanvasDelta = useCallback((dx: number, dy: number) => {
    const s = Math.max(stageScaleRef.current, 1e-6);
    return { x: dx / s, y: dy / s };
  }, []);

  const applyMedia = useCallback(
    (next: Transform2D, shouldSnapRotation = true) => {
      const t = targetRef.current;
      if (t.kind !== 'media') return;
      onMediaTransformChange(
        clampMediaTransform(next, t.coverScale, shouldSnapRotation ? undefined : { snapRotation: false })
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
      onDrag: ({ movement: [mx, my], pinching, cancel, first, last, memo, event, touches }) => {
        const t = targetRef.current;
        if (
          t.kind === 'off' ||
          t.kind === 'layer' ||
          pinching ||
          handlesActiveRef.current ||
          (touches ?? 1) > 1 ||
          isEditableFieldTarget(event?.target ?? null)
        ) {
          cancel();
          return memo;
        }
        if (first) {
          setGestureActive(true);
          return { x: t.transform.x, y: t.transform.y };
        }
        const start = memo as { x: number; y: number } | undefined;
        if (!start) return memo;
        const delta = toCanvasDelta(mx, my);
        applyMedia(
          {
            ...t.transform,
            x: start.x + delta.x,
            y: start.y + delta.y,
          },
          false
        );
        if (last) setGestureActive(false);
        return memo;
      },
      onPinch: ({
        offset: [scaleMul, angleDelta],
        origin: [ox, oy],
        first,
        last,
        memo,
        event,
        cancel,
      }) => {
        const t = targetRef.current;
        if (t.kind === 'off' || handlesActiveRef.current || isEditableFieldTarget(event?.target ?? null)) {
          cancel();
          return memo;
        }
        if (first || !pinchStartRef.current) {
          setGestureActive(true);
          pinchStartRef.current = {
            scale: t.transform.scale,
            rotation: t.transform.rotation,
            x: t.transform.x,
            y: t.transform.y,
          };
        }
        const start = pinchStartRef.current;
        const nextScale = start.scale * scaleMul;
        const nextRotation = last
          ? snapRotation(start.rotation + angleDelta)
          : start.rotation + angleDelta;

        if (t.kind === 'media') {
          const frame = frameRectRef.current;
          const base: Transform2D = {
            x: start.x,
            y: start.y,
            scale: start.scale,
            rotation: start.rotation,
          };
          let next: Transform2D = { ...base, scale: nextScale, rotation: nextRotation };
          if (frame) {
            const focal = clientToCanvasPoint(ox, oy, frame, stageScaleRef.current);
            next = {
              ...scaleMediaAroundCanvasPoint(base, focal, nextScale),
              rotation: nextRotation,
            };
          }
          // Snap near 0/90 while dragging so preview matches IG magnet feel.
          applyMedia(next, true);
        } else {
          applyLayer({
            x: start.x,
            y: start.y,
            scale: nextScale,
            rotation: nextRotation,
          });
        }
        if (last) setGestureActive(false);
        return memo;
      },
      onPinchEnd: () => {
        pinchStartRef.current = null;
        setGestureActive(false);
      },
      onWheel: ({ event, delta: [, dy] }) => {
        const t = targetRef.current;
        if (t.kind === 'off' || handlesActiveRef.current) return;
        if (isEditableFieldTarget(event.target)) return;
        event.preventDefault();
        setGestureActive(true);
        if (wheelEndTimerRef.current) clearTimeout(wheelEndTimerRef.current);
        wheelEndTimerRef.current = setTimeout(() => setGestureActive(false), 140);
        const factor = Math.exp(-dy * 0.0015);
        if (t.kind === 'media') {
          const frame = frameRectRef.current;
          const nextScale = t.transform.scale * factor;
          if (frame) {
            const focal = clientToCanvasPoint(event.clientX, event.clientY, frame, stageScaleRef.current);
            applyMedia(scaleMediaAroundCanvasPoint(t.transform, focal, nextScale), false);
          } else {
            applyMedia({ ...t.transform, scale: nextScale }, false);
          }
        } else {
          applyLayer({ ...t.transform, scale: t.transform.scale * factor });
        }
      },
      onDoubleClick: ({ event }) => {
        if (handlesActiveRef.current || isEditableFieldTarget(event.target)) return;
        if (targetRef.current.kind === 'media') onMediaReset();
      },
    },
    {
      eventOptions: { passive: false },
      drag: {
        filterTaps: true,
        pointer: { touch: true, capture: false },
      },
      pinch: {
        rubberband: true,
        scaleBounds: { min: 0.15, max: 8 },
        pointer: { touch: true },
      },
      wheel: { eventOptions: { passive: false } },
      enabled: target.kind !== 'off',
    }
  );

  return { bind, isGestureActive };
}
