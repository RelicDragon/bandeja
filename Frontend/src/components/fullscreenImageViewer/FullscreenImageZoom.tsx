import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
} from 'react-zoom-pan-pinch';
import { isImageViewZoomed } from './imageViewTransform';

export type FullscreenImageZoomHandle = {
  resetTransform: () => void;
  isZoomed: () => boolean;
};

type FullscreenImageZoomProps = {
  src: string;
  active: boolean;
  onTap?: () => void;
};

const TAP_MOVE_THRESHOLD_PX = 10;
const TAP_CLOSE_DELAY_MS = 280;

export const FullscreenImageZoom = forwardRef<FullscreenImageZoomHandle, FullscreenImageZoomProps>(
  function FullscreenImageZoom({ src, active, onTap }, ref) {
    const zoomRef = useRef<ReactZoomPanPinchContentRef | null>(null);
    const stateRef = useRef({ scale: 1, positionX: 0, positionY: 0 });
    const [panningDisabled, setPanningDisabled] = useState(true);
    const tapStartRef = useRef<{ x: number; y: number } | null>(null);
    const tapSuppressedRef = useRef(false);
    const tapCloseTimerRef = useRef<ReturnType<typeof setTimeout>>();

    const clearTapCloseTimer = useCallback(() => {
      if (tapCloseTimerRef.current) {
        clearTimeout(tapCloseTimerRef.current);
        tapCloseTimerRef.current = undefined;
      }
    }, []);

    const scheduleTapClose = useCallback(() => {
      if (!onTap) return;
      clearTapCloseTimer();
      tapCloseTimerRef.current = setTimeout(() => {
        tapCloseTimerRef.current = undefined;
        if (!tapSuppressedRef.current) onTap();
      }, TAP_CLOSE_DELAY_MS);
    }, [clearTapCloseTimer, onTap]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clearTapCloseTimer();
      tapSuppressedRef.current = false;
      tapStartRef.current = { x: e.clientX, y: e.clientY };
    }, [clearTapCloseTimer]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const start = tapStartRef.current;
      tapStartRef.current = null;
      if (!start) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_MOVE_THRESHOLD_PX;
      if (!moved && !tapSuppressedRef.current) scheduleTapClose();
    }, [scheduleTapClose]);

    useEffect(() => () => clearTapCloseTimer(), [clearTapCloseTimer]);

    const syncState = useCallback((scale: number, positionX: number, positionY: number) => {
      stateRef.current = { scale, positionX, positionY };
      setPanningDisabled(scale <= 1.01);
    }, []);

    const resetToFitView = useCallback(() => {
      zoomRef.current?.resetTransform(0);
      syncState(1, 0, 0);
    }, [syncState]);

    useImperativeHandle(
      ref,
      () => ({
        resetTransform: resetToFitView,
        isZoomed: () => {
          const s = stateRef.current;
          return isImageViewZoomed(s.scale, s.positionX, s.positionY);
        },
      }),
      [resetToFitView],
    );

    useEffect(() => {
      if (active) resetToFitView();
    }, [active, src, resetToFitView]);

    if (!active) return null;

    return (
      <div
        className="relative h-full w-full min-h-0 min-w-0 touch-none select-none"
        onPointerDownCapture={handlePointerDown}
        onPointerUpCapture={handlePointerUp}
        onPointerCancelCapture={() => { tapStartRef.current = null; clearTapCloseTimer(); }}
      >
        <TransformWrapper
          key={src}
          ref={zoomRef}
          minScale={0.5}
          maxScale={8}
          limitToBounds
          centerOnInit
          centerZoomedOut
          smooth={false}
          wheel={{ step: 0.04, touchPadDisabled: false }}
          pinch={{ step: 0.12 }}
          panning={{ disabled: panningDisabled, velocityDisabled: true }}
          trackPadPanning={{ disabled: true }}
          velocityAnimation={{ disabled: true }}
          doubleClick={{ mode: 'toggle', step: 1.75, animationTime: 250, animationType: 'easeOut' }}
          onInit={(ctx) => {
            syncState(ctx.state.scale, ctx.state.positionX, ctx.state.positionY);
            requestAnimationFrame(() => resetToFitView());
          }}
          onTransform={(ctx) =>
            syncState(ctx.state.scale, ctx.state.positionX, ctx.state.positionY)
          }
          onZoomStart={() => {
            tapSuppressedRef.current = true;
            clearTapCloseTimer();
          }}
          onPanningStart={() => {
            if (stateRef.current.scale > 1.01) {
              tapSuppressedRef.current = true;
              clearTapCloseTimer();
            }
          }}
          onPinchStart={() => { tapSuppressedRef.current = true; clearTapCloseTimer(); }}
          onWheelStart={() => { tapSuppressedRef.current = true; clearTapCloseTimer(); }}
        >
          <TransformComponent
            wrapperClass="!h-full !w-full"
            contentClass="!flex !h-full !w-full !items-center !justify-center"
          >
            <img
              src={src}
              alt=""
              draggable={false}
              className="max-h-full max-w-full object-contain"
              onLoad={() => {
                requestAnimationFrame(() => resetToFitView());
              }}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>
    );
  },
);
