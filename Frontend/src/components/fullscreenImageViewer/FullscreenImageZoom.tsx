import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { useFullscreenImageGestures } from './useFullscreenImageGestures';

export type FullscreenImageZoomHandle = {
  resetTransform: () => void;
  isZoomed: () => boolean;
};

type FullscreenImageZoomProps = {
  src: string;
  active: boolean;
  onTap?: () => void;
  onDismiss?: () => void;
  onDismissOffsetChange?: (offsetY: number) => void;
};

const TAP_MOVE_THRESHOLD_PX = 12;
const DOUBLE_TAP_MS = 280;

export const FullscreenImageZoom = forwardRef<FullscreenImageZoomHandle, FullscreenImageZoomProps>(
  function FullscreenImageZoom(
    { src, active, onTap, onDismiss, onDismissOffsetChange },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const tapOriginRef = useRef<{ x: number; y: number; at: number } | null>(null);
    const activePointersRef = useRef<Set<number>>(new Set());
    const multiTouchRef = useRef(false);
    const pendingTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onTapRef = useRef(onTap);
    onTapRef.current = onTap;

    const { resetTransform, isZoomed, isGestureBusy, toggleDoubleTapZoom } =
      useFullscreenImageGestures({
        enabled: active,
        containerRef,
        contentRef,
        onDismiss,
        onDismissOffsetChange,
      });

    useImperativeHandle(
      ref,
      () => ({
        resetTransform,
        isZoomed,
      }),
      [isZoomed, resetTransform],
    );

    useEffect(() => {
      if (active) resetTransform();
    }, [active, src, resetTransform]);

    const clearPendingTap = useCallback(() => {
      if (pendingTapTimerRef.current) {
        clearTimeout(pendingTapTimerRef.current);
        pendingTapTimerRef.current = null;
      }
    }, []);

    useEffect(() => () => clearPendingTap(), [clearPendingTap]);

    // Pointer may release outside the element — keep the active set honest via window.
    useEffect(() => {
      if (!active) return;

      const onWinUp = (e: PointerEvent) => {
        if (!activePointersRef.current.has(e.pointerId)) return;
        // Inside pointerup is owned by onPointerUpCapture (tap / double-tap).
        // pointercancel is always cleaned here (element may not see it).
        if (e.type === 'pointerup' && containerRef.current?.contains(e.target as Node)) {
          return;
        }

        activePointersRef.current.delete(e.pointerId);
        if (activePointersRef.current.size === 0) {
          multiTouchRef.current = false;
        } else {
          multiTouchRef.current = true;
        }
        tapOriginRef.current = null;
        clearPendingTap();
      };

      window.addEventListener('pointerup', onWinUp, true);
      window.addEventListener('pointercancel', onWinUp, true);
      const pointers = activePointersRef.current;
      return () => {
        window.removeEventListener('pointerup', onWinUp, true);
        window.removeEventListener('pointercancel', onWinUp, true);
        pointers.clear();
        multiTouchRef.current = false;
        tapOriginRef.current = null;
      };
    }, [active, clearPendingTap]);

    const handlePointerDownCapture = useCallback(
      (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        activePointersRef.current.add(e.pointerId);
        if (activePointersRef.current.size > 1) {
          multiTouchRef.current = true;
          tapOriginRef.current = null;
          clearPendingTap();
          return;
        }
        multiTouchRef.current = false;
        tapOriginRef.current = { x: e.clientX, y: e.clientY, at: performance.now() };
      },
      [clearPendingTap],
    );

    const handlePointerUpCapture = useCallback(
      (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        activePointersRef.current.delete(e.pointerId);
        const stillDown = activePointersRef.current.size > 0;
        const wasMulti = multiTouchRef.current;
        if (!stillDown) multiTouchRef.current = false;

        // Ignore lifts that are part of a pinch / multi-touch sequence.
        if (wasMulti || stillDown) {
          tapOriginRef.current = null;
          clearPendingTap();
          return;
        }
        if (isGestureBusy()) {
          tapOriginRef.current = null;
          clearPendingTap();
          return;
        }

        const origin = tapOriginRef.current;
        tapOriginRef.current = null;
        if (!origin) return;
        if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > TAP_MOVE_THRESHOLD_PX) {
          clearPendingTap();
          return;
        }
        if (performance.now() - origin.at > 500) return;

        if (pendingTapTimerRef.current) {
          clearPendingTap();
          toggleDoubleTapZoom(e.clientX, e.clientY);
          return;
        }

        pendingTapTimerRef.current = setTimeout(() => {
          pendingTapTimerRef.current = null;
          if (isGestureBusy() || isZoomed()) return;
          onTapRef.current?.();
        }, DOUBLE_TAP_MS);
      },
      [clearPendingTap, isGestureBusy, isZoomed, toggleDoubleTapZoom],
    );

    if (!active) return null;

    return (
      <div
        ref={containerRef}
        data-fullscreen-image-zoom=""
        className="relative h-full w-full min-h-0 min-w-0 touch-none select-none overflow-hidden"
        style={{ touchAction: 'none' }}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerUpCapture={handlePointerUpCapture}
      >
        <div
          ref={contentRef}
          className="flex h-full w-full items-center justify-center will-change-transform"
          style={{ transformOrigin: 'center center' }}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            decoding="async"
            fetchPriority="high"
            className="max-h-full max-w-full object-contain pointer-events-none"
          />
        </div>
      </div>
    );
  },
);
