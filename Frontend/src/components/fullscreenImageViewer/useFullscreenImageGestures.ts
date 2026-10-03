import { useCallback, useEffect, useRef } from 'react';
import { useGesture } from '@use-gesture/react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  IDENTITY_IMAGE_VIEW_TRANSFORM,
  IMAGE_VIEW_DOUBLE_TAP_SCALE,
  IMAGE_VIEW_MAX_SCALE,
  IMAGE_VIEW_MIN_SCALE,
  clampImageViewPan,
  clampImageViewScale,
  copyImageViewTransform,
  imageViewTransformCss,
  isImageViewZoomed,
  shouldDismissImageView,
  shouldSnapImageViewToFit,
  zoomImageViewAtPoint,
  type ImageViewTransform,
} from './imageViewTransform';

const WHEEL_ZOOM_SENSITIVITY = 0.0032;
/** Settle curve for snap-back, double-tap zoom and the dismiss fly-out. */
const SETTLE_TRANSITION = 'transform 320ms cubic-bezier(0.2, 0.9, 0.25, 1)';
/** Drag distance over which the image shrinks to its smallest dismiss scale. */
const DISMISS_SCALE_DISTANCE_PX = 520;
const DISMISS_MIN_SCALE = 0.7;

type PaintOptions = {
  dismissX?: number;
  dismissY?: number;
  animate?: boolean;
};

type UseFullscreenImageGesturesArgs = {
  enabled: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLElement | null>;
  onDismiss?: () => void;
  /** `settle` is true when the offset animates (snap-back / fly-out) rather than tracking a finger. */
  onDismissOffsetChange?: (offsetY: number, settle?: boolean) => void;
  onZoomChange?: (zoomed: boolean) => void;
  onHorizontalSwipeStart?: () => void;
  onHorizontalSwipeMove?: (offsetX: number) => void;
  onHorizontalSwipeEnd?: (offsetX: number, velocityX: number) => void;
};

export type FullscreenImageGestureApi = {
  resetTransform: (animated?: boolean) => void;
  isZoomed: () => boolean;
  /** True while drag/pinch is in progress — callers should ignore tap-close. */
  isGestureBusy: () => boolean;
  toggleDoubleTapZoom: (clientX: number, clientY: number) => void;
};

function relativeToCenter(
  container: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = container.getBoundingClientRect();
  return {
    x: clientX - (rect.left + rect.width / 2),
    y: clientY - (rect.top + rect.height / 2),
  };
}

export function useFullscreenImageGestures({
  enabled,
  containerRef,
  contentRef,
  onDismiss,
  onDismissOffsetChange,
  onZoomChange,
  onHorizontalSwipeStart,
  onHorizontalSwipeMove,
  onHorizontalSwipeEnd,
}: UseFullscreenImageGesturesArgs): FullscreenImageGestureApi {
  const reduceMotion = usePrefersReducedMotion();
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;
  const transformRef = useRef<ImageViewTransform>(
    copyImageViewTransform(IDENTITY_IMAGE_VIEW_TRANSFORM),
  );
  const dismissOffsetRef = useRef(0);
  const gestureBusyRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  const onDismissOffsetChangeRef = useRef(onDismissOffsetChange);
  const onZoomChangeRef = useRef(onZoomChange);
  const onHorizontalSwipeStartRef = useRef(onHorizontalSwipeStart);
  const onHorizontalSwipeMoveRef = useRef(onHorizontalSwipeMove);
  const onHorizontalSwipeEndRef = useRef(onHorizontalSwipeEnd);
  const zoomedRef = useRef(false);
  onDismissRef.current = onDismiss;
  onDismissOffsetChangeRef.current = onDismissOffsetChange;
  onZoomChangeRef.current = onZoomChange;
  onHorizontalSwipeStartRef.current = onHorizontalSwipeStart;
  onHorizontalSwipeMoveRef.current = onHorizontalSwipeMove;
  onHorizontalSwipeEndRef.current = onHorizontalSwipeEnd;

  const paint = useCallback(
    (next: ImageViewTransform, { dismissX = 0, dismissY = 0, animate = false }: PaintOptions = {}) => {
      transformRef.current = next;
      dismissOffsetRef.current = dismissY;
      const el = contentRef.current;
      if (!el) return;
      // Same transform function list in every state so the settle transition
      // interpolates component-wise instead of falling back to matrix blending.
      const dismissScale =
        1 - (1 - DISMISS_MIN_SCALE) * Math.min(1, dismissY / DISMISS_SCALE_DISTANCE_PX);
      el.style.transition = animate && !reduceMotionRef.current ? SETTLE_TRANSITION : 'none';
      el.style.transform =
        `translate3d(${dismissX}px, ${dismissY}px, 0) scale(${dismissScale}) ${imageViewTransformCss(next)}`;
      const zoomed = isImageViewZoomed(next);
      if (zoomedRef.current !== zoomed) {
        zoomedRef.current = zoomed;
        onZoomChangeRef.current?.(zoomed);
      }
    },
    [contentRef],
  );

  const resetTransform = useCallback((animated = false) => {
    gestureBusyRef.current = false;
    paint(copyImageViewTransform(IDENTITY_IMAGE_VIEW_TRANSFORM), { animate: animated });
    onDismissOffsetChangeRef.current?.(0, animated);
  }, [paint]);

  const isZoomed = useCallback(() => isImageViewZoomed(transformRef.current), []);
  const isGestureBusy = useCallback(() => gestureBusyRef.current, []);

  const setDismissOffset = useCallback(
    (x: number, y: number, animate = false) => {
      const nextY = Math.max(0, y);
      paint(transformRef.current, { dismissX: nextY > 0 ? x : 0, dismissY: nextY, animate });
      onDismissOffsetChangeRef.current?.(nextY, animate);
    },
    [paint],
  );

  const endDragGesture = useCallback(() => {
    gestureBusyRef.current = false;
    if (dismissOffsetRef.current > 0) setDismissOffset(0, 0, true);
  }, [setDismissOffset]);

  const clampCurrentPan = useCallback(
    (t: ImageViewTransform): ImageViewTransform => {
      const el = containerRef.current;
      if (!el) return t;
      const { width, height } = el.getBoundingClientRect();
      return clampImageViewPan(t, width, height);
    },
    [containerRef],
  );

  const toggleDoubleTapZoom = useCallback(
    (clientX: number, clientY: number) => {
      if (isImageViewZoomed(transformRef.current)) {
        resetTransform(true);
        return;
      }
      const container = containerRef.current;
      if (!container) {
        paint(
          { ...IDENTITY_IMAGE_VIEW_TRANSFORM, scale: IMAGE_VIEW_DOUBLE_TAP_SCALE },
          { animate: true },
        );
        return;
      }
      const point = relativeToCenter(container, clientX, clientY);
      paint(
        clampCurrentPan(
          zoomImageViewAtPoint(
            copyImageViewTransform(IDENTITY_IMAGE_VIEW_TRANSFORM),
            IMAGE_VIEW_DOUBLE_TAP_SCALE,
            point.x,
            point.y,
          ),
        ),
        { animate: true },
      );
    },
    [clampCurrentPan, containerRef, paint, resetTransform],
  );

  useEffect(() => {
    if (enabled) resetTransform();
  }, [enabled, resetTransform]);

  // `target` is required so wheel/pinch can preventDefault (React ignores passive:false on bind props).
  useGesture(
    {
      onDrag: ({
        first,
        last,
        canceled,
        movement: [mx, my],
        velocity: [vx, vy],
        pinching,
        touches,
        cancel,
        memo,
        event,
        tap,
      }) => {
        if (!enabled) return memo;
        if (canceled) {
          const state = memo as { mode?: string } | undefined;
          if (state?.mode === 'horizontal') {
            onHorizontalSwipeEndRef.current?.(0, 0);
          }
          endDragGesture();
          return memo;
        }
        if (pinching || touches > 1) {
          const state = memo as { mode?: string } | undefined;
          if (state?.mode === 'horizontal') {
            onHorizontalSwipeEndRef.current?.(0, 0);
          }
          endDragGesture();
          cancel();
          return memo;
        }
        // filterTaps still delivers a final event with tap=true — ignore it for dismiss/pan.
        if (tap) return memo;

        const zoomed = isImageViewZoomed(transformRef.current);

        if (!zoomed) {
          if (first) {
            gestureBusyRef.current = false;
            return { mode: 'undecided' as const };
          }
          const state = memo as {
            mode?: 'undecided' | 'dismiss' | 'horizontal' | 'ignored';
          } | undefined;
          let mode = state?.mode ?? 'undecided';

          if (mode === 'undecided' && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
            if (Math.abs(mx) > Math.abs(my)) {
              mode = 'horizontal';
              gestureBusyRef.current = true;
              onHorizontalSwipeStartRef.current?.();
            } else if (my > 0) {
              mode = 'dismiss';
            } else {
              mode = 'ignored';
            }
          }

          if (mode === 'horizontal') {
            gestureBusyRef.current = true;
            if (event.cancelable) event.preventDefault();
            onHorizontalSwipeMoveRef.current?.(mx);
            if (last) {
              gestureBusyRef.current = false;
              onHorizontalSwipeEndRef.current?.(mx, vx);
            }
            return { mode };
          }

          if (mode !== 'dismiss') return { mode };

          // Once committed to dismiss, the image follows the finger freely and
          // shrinks with distance; the backdrop fades in step.
          gestureBusyRef.current = true;
          if (event.cancelable) event.preventDefault();
          setDismissOffset(mx, my);

          if (last) {
            const offset = dismissOffsetRef.current;
            if (shouldDismissImageView(offset, vy, false)) {
              gestureBusyRef.current = false;
              const height = containerRef.current?.clientHeight || window.innerHeight;
              setDismissOffset(mx, offset + height * 0.6, true);
              onDismissRef.current?.();
            } else {
              endDragGesture();
            }
          }
          return { mode };
        }

        if (event.cancelable) event.preventDefault();
        if (first) {
          gestureBusyRef.current = true;
          return {
            mode: 'pan' as const,
            x: transformRef.current.x,
            y: transformRef.current.y,
          };
        }
        const start = memo as { mode?: 'pan'; x: number; y: number } | undefined;
        if (start?.mode !== 'pan') return memo;
        paint(
          clampCurrentPan({
            ...transformRef.current,
            x: start.x + mx,
            y: start.y + my,
          }),
        );
        if (last) {
          gestureBusyRef.current = false;
          if (shouldSnapImageViewToFit(transformRef.current)) resetTransform(true);
        }
        return memo;
      },
      onPinch: ({
        first,
        last,
        canceled,
        origin: [ox, oy],
        offset: [scale, angle],
        memo,
        event,
      }) => {
        if (!enabled) return memo;
        if (canceled) {
          gestureBusyRef.current = false;
          if (shouldSnapImageViewToFit(transformRef.current)) resetTransform(true);
          return memo;
        }
        if (event.cancelable) event.preventDefault();
        gestureBusyRef.current = true;
        if (dismissOffsetRef.current > 0) setDismissOffset(0, 0);

        const container = containerRef.current;
        if (!container) return memo;
        const origin = relativeToCenter(container, ox, oy);

        if (first) {
          return {
            prevScale: scale,
            originX: origin.x,
            originY: origin.y,
          };
        }

        const prev = memo as
          | { prevScale: number; originX: number; originY: number }
          | undefined;
        const prevScale = prev?.prevScale || transformRef.current.scale || 1;
        const originX = prev?.originX ?? origin.x;
        const originY = prev?.originY ?? origin.y;
        const nextScale = clampImageViewScale(scale);
        const ratio = nextScale / (prevScale || 1);
        const next = clampCurrentPan({
          x: originX - (originX - transformRef.current.x) * ratio,
          y: originY - (originY - transformRef.current.y) * ratio,
          scale: nextScale,
          rotation: angle,
        });
        paint(next);

        if (last) {
          gestureBusyRef.current = false;
          if (shouldSnapImageViewToFit(transformRef.current)) resetTransform(true);
          return undefined;
        }
        return { prevScale: nextScale, originX, originY };
      },
      onWheel: ({ event, delta: [dx, dy] }) => {
        if (!enabled) return;
        // Trackpad pinch arrives as ctrl+wheel and is owned by pinchOnWheel → onPinch.
        // Handling it here would double-zoom.
        if (event.ctrlKey) return;

        event.preventDefault();
        if (dismissOffsetRef.current > 0) setDismissOffset(0, 0);
        const container = containerRef.current;
        if (!container) return;

        if (isImageViewZoomed(transformRef.current)) {
          paint(
            clampCurrentPan({
              ...transformRef.current,
              x: transformRef.current.x - dx,
              y: transformRef.current.y - dy,
            }),
          );
          return;
        }

        // Mouse wheel at fit → zoom toward cursor.
        const point = relativeToCenter(container, event.clientX, event.clientY);
        const factor = Math.exp(-dy * WHEEL_ZOOM_SENSITIVITY);
        const zoomed = zoomImageViewAtPoint(
          transformRef.current,
          transformRef.current.scale * factor,
          point.x,
          point.y,
        );
        paint(clampCurrentPan(zoomed));
      },
    },
    {
      target: containerRef,
      enabled,
      eventOptions: { passive: false },
      drag: {
        filterTaps: true,
        pointer: { touch: true },
      },
      pinch: {
        from: () => [transformRef.current.scale, transformRef.current.rotation],
        scaleBounds: { min: IMAGE_VIEW_MIN_SCALE, max: IMAGE_VIEW_MAX_SCALE },
        rubberband: true,
        pointer: { touch: true },
        pinchOnWheel: true,
      },
      wheel: {
        eventOptions: { passive: false },
      },
    },
  );

  return { resetTransform, isZoomed, isGestureBusy, toggleDoubleTapZoom };
}
