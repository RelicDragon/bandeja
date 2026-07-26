import { useCallback, useEffect, useRef, useState } from 'react';
import { useGesture } from '@use-gesture/react';
import type { Transform2D } from '../types';
import { clientToCanvasPoint, scaleMediaAroundCanvasPoint } from '../utils/mediaPinchMath';
import {
  nextDoubleTapScale,
  rubberband,
  wheelZoomFactor,
} from '../utils/iosGestureFeel';
import { clampLayerTransform, clampMediaPan, clampMediaTransform, snapRotation } from '../utils/transform';

export type PhotoStoryGestureTarget =
  | {
      kind: 'media';
      transform: Transform2D;
      coverScale: number;
      minScale: number;
      maxScale: number;
      mediaWidth: number;
      mediaHeight: number;
    }
  | { kind: 'layer'; transform: Transform2D }
  | { kind: 'off' };

type UsePhotoStoryGesturesOptions = {
  target: PhotoStoryGestureTarget;
  stageScale: number;
  frameRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | null;
  onMediaTransformChange: (next: Transform2D) => void;
  onLayerTransformChange: (next: Transform2D) => void;
  onMediaReset: () => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  handlesActive?: boolean;
};

const DOUBLE_TAP_MS = 280;

function isEditableFieldTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/** Trackpad pinch arrives as ctrl/meta + wheel — handled by use-gesture pinch, not onWheel. */
export function isTrackpadPinchWheel(event: WheelEvent): boolean {
  return event.ctrlKey || event.metaKey;
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
  const lastTapAtRef = useRef(0);
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

  const endGestureIfActive = useCallback(() => {
    if (wheelEndTimerRef.current) {
      clearTimeout(wheelEndTimerRef.current);
      wheelEndTimerRef.current = null;
    }
    setGestureActive(false);
  }, [setGestureActive]);

  useEffect(() => {
    if (target.kind === 'off') endGestureIfActive();
  }, [endGestureIfActive, target.kind]);

  useEffect(() => {
    return () => {
      if (wheelEndTimerRef.current) clearTimeout(wheelEndTimerRef.current);
      if (gestureActiveRef.current) {
        gestureActiveRef.current = false;
        onGestureEnd?.();
      }
    };
  }, [onGestureEnd]);

  const toCanvasDelta = useCallback((dx: number, dy: number) => {
    const s = Math.max(stageScaleRef.current, 1e-6);
    return { x: dx / s, y: dy / s };
  }, []);

  const applyMediaLive = useCallback(
    (next: Transform2D) => {
      const t = targetRef.current;
      if (t.kind !== 'media') return;
      const panCtx = {
        mediaWidth: t.mediaWidth,
        mediaHeight: t.mediaHeight,
        scale: next.scale,
        rotation: next.rotation,
      };
      const { x, y } = clampMediaPan(next.x, next.y, panCtx);
      const scale = rubberband(next.scale, t.minScale, t.maxScale);
      onMediaTransformChange({ x, y, scale, rotation: next.rotation });
    },
    [onMediaTransformChange]
  );

  const applyMediaCommit = useCallback(
    (next: Transform2D) => {
      const t = targetRef.current;
      if (t.kind !== 'media') return;
      onMediaTransformChange(
        clampMediaTransform(
          { ...next, rotation: snapRotation(next.rotation) },
          t.coverScale,
          {
            minScale: t.minScale,
            maxScale: t.maxScale,
            mediaWidth: t.mediaWidth,
            mediaHeight: t.mediaHeight,
            snapRotation: false,
          }
        )
      );
    },
    [onMediaTransformChange]
  );

  const applyLayerLive = useCallback(
    (next: Transform2D) => {
      if (targetRef.current.kind !== 'layer') return;
      onLayerTransformChange(clampLayerTransform(next));
    },
    [onLayerTransformChange]
  );

  const zoomMediaToScaleAtClient = useCallback(
    (clientX: number, clientY: number, nextScale: number) => {
      const t = targetRef.current;
      if (t.kind !== 'media') return;
      if (Math.abs(nextScale - t.coverScale) < 1e-6) {
        onMediaReset();
        return;
      }
      const frame = frameRectRef.current;
      let next: Transform2D = { ...t.transform, scale: nextScale };
      if (frame) {
        const focal = clientToCanvasPoint(clientX, clientY, frame, stageScaleRef.current);
        next = scaleMediaAroundCanvasPoint(t.transform, focal, nextScale);
      }
      applyMediaCommit(next);
    },
    [applyMediaCommit, onMediaReset]
  );

  const bind = useGesture(
    {
      onDrag: ({
        movement: [mx, my],
        pinching,
        cancel,
        first,
        last,
        memo,
        event,
        touches,
        buttons,
        altKey,
        shiftKey,
        tap,
      }) => {
        const t = targetRef.current;
        if (
          t.kind === 'off' ||
          t.kind === 'layer' ||
          pinching ||
          handlesActiveRef.current ||
          (touches ?? 1) > 1 ||
          isEditableFieldTarget(event?.target ?? null)
        ) {
          endGestureIfActive();
          cancel();
          return memo;
        }

        // Touch + mouse: double-tap / double-click zoom toggle (Capacitor + browser).
        if (tap && last && t.kind === 'media') {
          const now = performance.now();
          if (now - lastTapAtRef.current <= DOUBLE_TAP_MS) {
            lastTapAtRef.current = 0;
            const ev = event as PointerEvent | MouseEvent | TouchEvent;
            const point =
              'clientX' in ev
                ? { x: ev.clientX, y: ev.clientY }
                : 'changedTouches' in ev && ev.changedTouches[0]
                  ? { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY }
                  : null;
            if (point) {
              setGestureActive(true);
              const nextScale = nextDoubleTapScale(t.transform.scale, t.coverScale);
              zoomMediaToScaleAtClient(point.x, point.y, nextScale);
              setGestureActive(false);
            }
          } else {
            lastTapAtRef.current = now;
          }
          return memo;
        }

        // Desktop: Alt/Shift/right-drag rotates (touch uses two-finger twist via pinch).
        const rotateMode = !!(altKey || shiftKey || buttons === 2);
        if (rotateMode && t.kind === 'media') {
          if (first) {
            setGestureActive(true);
            return {
              rotation: t.transform.rotation,
              x: t.transform.x,
              y: t.transform.y,
              scale: t.transform.scale,
            };
          }
          const start = memo as
            | { rotation: number; x: number; y: number; scale: number }
            | undefined;
          if (!start) return memo;
          const next: Transform2D = {
            x: start.x,
            y: start.y,
            scale: start.scale,
            rotation: start.rotation + mx * 0.25,
          };
          if (last) {
            applyMediaCommit(next);
            setGestureActive(false);
          } else {
            applyMediaLive(next);
          }
          return memo;
        }

        if (first) {
          setGestureActive(true);
          return { x: t.transform.x, y: t.transform.y };
        }
        const start = memo as { x: number; y: number } | undefined;
        if (!start) return memo;
        const delta = toCanvasDelta(mx, my);
        const next = {
          ...t.transform,
          x: start.x + delta.x,
          y: start.y + delta.y,
        };
        if (last) {
          applyMediaCommit(next);
          setGestureActive(false);
        } else {
          applyMediaLive(next);
        }
        return memo;
      },
      onPinch: ({
        offset: [scaleMul, angleDelta],
        origin: [ox, oy],
        first,
        last,
        event,
        cancel,
      }) => {
        const t = targetRef.current;
        if (t.kind === 'off' || handlesActiveRef.current || isEditableFieldTarget(event?.target ?? null)) {
          endGestureIfActive();
          cancel();
          return;
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
        const nextScale = start.scale * Math.max(0.01, scaleMul);
        const nextRotation = start.rotation + angleDelta;

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
          if (last) {
            applyMediaCommit(next);
            setGestureActive(false);
          } else {
            applyMediaLive(next);
          }
        } else {
          applyLayerLive({
            x: start.x,
            y: start.y,
            scale: nextScale,
            rotation: last ? snapRotation(nextRotation) : nextRotation,
          });
          if (last) setGestureActive(false);
        }
      },
      onPinchEnd: () => {
        pinchStartRef.current = null;
        setGestureActive(false);
      },
      onWheel: ({ event, delta: [, dy] }) => {
        const t = targetRef.current;
        if (t.kind === 'off' || handlesActiveRef.current) return;
        if (isEditableFieldTarget(event.target)) return;
        // Trackpad pinch → pinch engine (ctrl/meta + wheel). Avoid double zoom.
        if (isTrackpadPinchWheel(event)) return;

        event.preventDefault();
        setGestureActive(true);
        if (wheelEndTimerRef.current) clearTimeout(wheelEndTimerRef.current);
        wheelEndTimerRef.current = setTimeout(() => {
          const cur = targetRef.current;
          if (cur.kind === 'media') applyMediaCommit(cur.transform);
          setGestureActive(false);
        }, 160);

        const factor = wheelZoomFactor(dy, event.deltaMode ?? 0);
        if (t.kind === 'media') {
          const frame = frameRectRef.current;
          const nextScale = t.transform.scale * factor;
          if (frame) {
            const focal = clientToCanvasPoint(event.clientX, event.clientY, frame, stageScaleRef.current);
            applyMediaLive(scaleMediaAroundCanvasPoint(t.transform, focal, nextScale));
          } else {
            applyMediaLive({ ...t.transform, scale: nextScale });
          }
        } else {
          applyLayerLive({ ...t.transform, scale: t.transform.scale * factor });
        }
      },
    },
    {
      eventOptions: { passive: false },
      drag: {
        filterTaps: true,
        threshold: 3,
        pointer: { touch: true, capture: false },
      },
      pinch: {
        // Multiplier resets each gesture (zoom-out works).
        from: () => [1, 0] as [number, number],
        scaleBounds: { min: 0.05, max: 12 },
        rubberband: 0.15,
        // Touch devices: TouchEvent path (Capacitor iOS/Android + mobile browsers).
        pointer: { touch: true },
        // Desktop trackpad pinch = ctrl/meta+wheel → onPinch (not onWheel).
        modifierKey: ['ctrlKey', 'metaKey'],
        pinchOnWheel: true,
      },
      wheel: { eventOptions: { passive: false } },
      enabled: target.kind !== 'off',
    }
  );

  return { bind, isGestureActive, endGesture: endGestureIfActive };
}
