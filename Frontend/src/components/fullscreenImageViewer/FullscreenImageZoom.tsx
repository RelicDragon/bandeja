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
};

export const FullscreenImageZoom = forwardRef<FullscreenImageZoomHandle, FullscreenImageZoomProps>(
  function FullscreenImageZoom({ src, active }, ref) {
    const zoomRef = useRef<ReactZoomPanPinchContentRef | null>(null);
    const stateRef = useRef({ scale: 1, positionX: 0, positionY: 0 });
    const [panningDisabled, setPanningDisabled] = useState(true);

    const syncState = useCallback((scale: number, positionX: number, positionY: number) => {
      stateRef.current = { scale, positionX, positionY };
      setPanningDisabled(scale <= 1.01);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        resetTransform: () => zoomRef.current?.resetTransform(0),
        isZoomed: () => {
          const s = stateRef.current;
          return isImageViewZoomed(s.scale, s.positionX, s.positionY);
        },
      }),
      [],
    );

    useEffect(() => {
      if (active) {
        zoomRef.current?.resetTransform(0);
        syncState(1, 0, 0);
      }
    }, [active, src, syncState]);

    if (!active) return null;

    return (
      <div className="relative max-h-full max-w-full touch-none select-none">
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
          doubleClick={{ mode: 'toggle', step: 1.75, animationTime: 0 }}
          onInit={(ctx) => syncState(ctx.state.scale, ctx.state.positionX, ctx.state.positionY)}
          onTransform={(ctx) =>
            syncState(ctx.state.scale, ctx.state.positionX, ctx.state.positionY)
          }
        >
          <TransformComponent
            wrapperClass="!max-h-full !max-w-full"
            contentClass="!flex items-center justify-center"
          >
            <img
              src={src}
              alt=""
              draggable={false}
              className="max-h-full max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>
    );
  },
);
