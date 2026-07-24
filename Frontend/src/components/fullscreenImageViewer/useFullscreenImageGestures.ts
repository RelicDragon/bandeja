import { useCallback, useEffect, useRef } from 'react';
import { useGesture } from '@use-gesture/react';
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

type UseFullscreenImageGesturesArgs = {
  enabled: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLElement | null>;
  onDismiss?: () => void;
  onDismissOffsetChange?: (offsetY: number) => void;
};

export type FullscreenImageGestureApi = {
  resetTransform: () => void;
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
}: UseFullscreenImageGesturesArgs): FullscreenImageGestureApi {
  const transformRef = useRef<ImageViewTransform>(
    copyImageViewTransform(IDENTITY_IMAGE_VIEW_TRANSFORM),
  );
  const dismissOffsetRef = useRef(0);
  const gestureBusyRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  const onDismissOffsetChangeRef = useRef(onDismissOffsetChange);
  onDismissRef.current = onDismiss;
  onDismissOffsetChangeRef.current = onDismissOffsetChange;

  const paint = useCallback(
    (next: ImageViewTransform, dismissY = 0) => {
      transformRef.current = next;
      dismissOffsetRef.current = dismissY;
      const el = contentRef.current;
      if (!el) return;
      const base = imageViewTransformCss(next);
      el.style.transform = dismissY
        ? `${base} translate3d(0, ${dismissY}px, 0)`
        : base;
    },
    [contentRef],
  );

  const resetTransform = useCallback(() => {
    gestureBusyRef.current = false;
    paint(copyImageViewTransform(IDENTITY_IMAGE_VIEW_TRANSFORM), 0);
    onDismissOffsetChangeRef.current?.(0);
  }, [paint]);

  const isZoomed = useCallback(() => isImageViewZoomed(transformRef.current), []);
  const isGestureBusy = useCallback(() => gestureBusyRef.current, []);

  const setDismissOffset = useCallback(
    (y: number) => {
      const next = Math.max(0, y);
      paint(transformRef.current, next);
      onDismissOffsetChangeRef.current?.(next);
    },
    [paint],
  );

  const endDragGesture = useCallback(() => {
    gestureBusyRef.current = false;
    if (dismissOffsetRef.current > 0) setDismissOffset(0);
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
        resetTransform();
        return;
      }
      const container = containerRef.current;
      if (!container) {
        paint({ ...IDENTITY_IMAGE_VIEW_TRANSFORM, scale: IMAGE_VIEW_DOUBLE_TAP_SCALE });
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
        velocity: [, vy],
        pinching,
        touches,
        cancel,
        memo,
        event,
        tap,
      }) => {
        if (!enabled) return memo;
        if (canceled) {
          endDragGesture();
          return memo;
        }
        if (pinching || touches > 1) {
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
            return { mode: 'dismiss' as const };
          }
          const state = memo as { mode?: 'dismiss' | 'pan' } | undefined;
          if (state?.mode !== 'dismiss') return memo;

          if (my > 8 && Math.abs(my) > Math.abs(mx)) {
            gestureBusyRef.current = true;
            if (event.cancelable) event.preventDefault();
            setDismissOffset(my);
          } else if (dismissOffsetRef.current > 0 && my <= 8) {
            setDismissOffset(0);
          }

          if (last) {
            const offset = dismissOffsetRef.current;
            if (shouldDismissImageView(offset, vy, false)) {
              gestureBusyRef.current = false;
              onDismissRef.current?.();
            } else {
              endDragGesture();
            }
          }
          return memo ?? { mode: 'dismiss' as const };
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
          if (shouldSnapImageViewToFit(transformRef.current)) resetTransform();
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
          if (shouldSnapImageViewToFit(transformRef.current)) resetTransform();
          return memo;
        }
        if (event.cancelable) event.preventDefault();
        gestureBusyRef.current = true;
        if (dismissOffsetRef.current > 0) setDismissOffset(0);

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
          if (shouldSnapImageViewToFit(transformRef.current)) resetTransform();
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
        if (dismissOffsetRef.current > 0) setDismissOffset(0);
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
