import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { OverlayStyleV2, StoryMediaAdjust, Transform2D } from '@/components/stories/create/types/storyEditor.types';
import {
  STORY_COMPOSITION_STAGE_CLASS,
  measureStoryCompositionFrame,
  storyCompositionFrameStyle,
} from '@/components/stories/create/utils/storyCompositionFrameStyle';
import { viewportScaleFromFrameWidth } from '@/components/stories/create/utils/storyCompositionLayout';
import { StoryCompositionCanvasOverlays } from '@/components/stories/StoryCompositionCanvasOverlays';
import { StoryCompositionMedia } from '@/components/stories/StoryCompositionMedia';

export type StoryCompositionViewportContext = {
  frameScale: number;
  frameRect: DOMRect | null;
};

type StoryCompositionViewportProps = {
  /** Stage container class (full available area). Frame is letterboxed to 9:16 inside. */
  className?: string;
  /** @deprecated Ignored — frame is always letterboxed to true 9:16 via JS fit. */
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

export function StoryCompositionViewport({
  className,
  media,
  overlayStyle,
  onMeasure,
  children,
}: StoryCompositionViewportProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const onMeasureRef = useRef(onMeasure);
  onMeasureRef.current = onMeasure;

  const [frameScale, setFrameScale] = useState(() => viewportScaleFromFrameWidth(360));
  const [frameRect, setFrameRect] = useState<DOMRect | null>(null);
  const [frameStyle, setFrameStyle] = useState(() =>
    storyCompositionFrameStyle(measureStoryCompositionFrame(360, 640))
  );

  const measure = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const stageBox = stage.getBoundingClientRect();
    if (stageBox.width <= 0 || stageBox.height <= 0) return;

    const fitted = measureStoryCompositionFrame(stageBox.width, stageBox.height);
    if (fitted.frameWidth <= 0 || fitted.frameHeight <= 0) return;

    setFrameStyle(storyCompositionFrameStyle(fitted));
    setFrameScale(viewportScaleFromFrameWidth(fitted.frameWidth));

    const nextRect = new DOMRect(
      stageBox.left + fitted.offsetX,
      stageBox.top + fitted.offsetY,
      fitted.frameWidth,
      fitted.frameHeight
    );
    setFrameRect(nextRect);
    onMeasureRef.current?.({ w: fitted.frameWidth, h: fitted.frameHeight }, nextRect);
  }, []);

  useLayoutEffect(() => {
    measure();
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div ref={stageRef} className={className ?? STORY_COMPOSITION_STAGE_CLASS}>
      <div
        ref={frameRef}
        className="relative bg-black"
        style={frameStyle}
        data-story-composition-frame
      >
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
            <StoryCompositionCanvasOverlays overlayStyle={overlayStyle} frameScale={frameScale} />
          </div>
        ) : null}
        {children?.({ frameScale, frameRect })}
      </div>
    </div>
  );
}
