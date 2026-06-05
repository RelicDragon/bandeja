import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { OverlayStyleV2, StoryMediaAdjust, Transform2D } from '@/components/stories/create/types/storyEditor.types';
import {
  STORY_COMPOSITION_FRAME_CLASS,
  viewportScaleFromFrameWidth,
} from '@/components/stories/create/utils/storyCompositionLayout';
import { paintCompositionOverlaysToCanvas } from '@/components/stories/create/utils/storyCompositionViewport';
import { StoryCompositionMedia } from '@/components/stories/StoryCompositionMedia';

export type StoryCompositionViewportContext = {
  frameScale: number;
  frameRect: DOMRect | null;
};

type StoryCompositionViewportProps = {
  className?: string;
  centerInStage?: boolean;
  media?: {
    transform: Transform2D;
    adjust: StoryMediaAdjust;
    naturalWidth: number;
    naturalHeight: number;
    children: ReactNode;
  };
  overlayStyle?: OverlayStyleV2 | null;
  onMeasure?: (size: { w: number; h: number }, frameRect: DOMRect) => void;
  children?: (ctx: StoryCompositionViewportContext) => ReactNode;
};

function StoryCompositionOverlayCanvas({
  overlayStyle,
  frameScale,
}: {
  overlayStyle: OverlayStyleV2;
  frameScale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    paintCompositionOverlaysToCanvas(canvas, overlayStyle, frameScale);
  }, [frameScale, overlayStyle]);

  useLayoutEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}

export function StoryCompositionViewport({
  className,
  centerInStage = false,
  media,
  overlayStyle,
  onMeasure,
  children,
}: StoryCompositionViewportProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameScale, setFrameScale] = useState(() => viewportScaleFromFrameWidth(360));
  const [frameRect, setFrameRect] = useState<DOMRect | null>(null);

  const measure = useCallback(() => {
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    setFrameRect(rect);
    setFrameScale(viewportScaleFromFrameWidth(rect.width));
    onMeasure?.({ w: rect.width, h: rect.height }, rect);
  }, [onMeasure]);

  useLayoutEffect(() => {
    measure();
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const frame = (
    <div ref={frameRef} className={className ?? STORY_COMPOSITION_FRAME_CLASS}>
      {media ? (
        <StoryCompositionMedia
          frameScale={frameScale}
          mediaTransform={media.transform}
          mediaAdjust={media.adjust}
          naturalWidth={media.naturalWidth}
          naturalHeight={media.naturalHeight}
        >
          {media.children}
        </StoryCompositionMedia>
      ) : null}
      {overlayStyle && (overlayStyle.layers?.length ?? 0) > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10">
          <StoryCompositionOverlayCanvas overlayStyle={overlayStyle} frameScale={frameScale} />
        </div>
      ) : null}
      {children?.({ frameScale, frameRect })}
    </div>
  );

  if (!centerInStage) return frame;

  return (
    <div className="flex h-full w-full items-center justify-center">
      {frame}
    </div>
  );
}
