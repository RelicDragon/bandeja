import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { cloneSlideForLive, type StoryEditorMode, type StorySlide } from './types/storyEditor.types';
import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH } from './types/storyEditor.types';
import { StoryCanvasStage } from './StoryCanvasStage';
import { useCanvasStageGestures } from './hooks/useCanvasStageGestures';
import { computeCoverScale } from './utils/storyTransform';

type StoryCanvasStageEditorProps = {
  slide: StorySlide;
  stageScale: number;
  stageWidth: number;
  stageHeight: number;
  editorMode: StoryEditorMode;
  selectedLayerId: string | null;
  gesturesDisabled: boolean;
  liveSlideRef: RefObject<StorySlide | null>;
  onLoadDimensions: (w: number, h: number) => void;
  onCommitSlide: (slide: StorySlide) => void;
  onSelectLayer: (layerId: string | null) => void;
  onLayerEditStart?: (layerId: string) => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  onGestureActiveChange?: (active: boolean) => void;
  gestureActive?: boolean;
};

export function StoryCanvasStageEditor({
  slide,
  stageScale,
  stageWidth,
  stageHeight,
  editorMode,
  selectedLayerId,
  gesturesDisabled,
  liveSlideRef,
  onLoadDimensions,
  onCommitSlide,
  onSelectLayer,
  onLayerEditStart,
  onGestureStart,
  onGestureEnd,
  onGestureActiveChange,
  gestureActive = false,
}: StoryCanvasStageEditorProps) {
  const redrawRef = useRef<(() => void) | null>(null);
  const requestRedraw = useCallback(() => redrawRef.current?.(), []);
  const registerRedraw = useCallback((draw: () => void) => {
    redrawRef.current = draw;
  }, []);

  const mediaW = slide.media.naturalWidth ?? STORY_CANVAS_WIDTH;
  const mediaH = slide.media.naturalHeight ?? STORY_CANVAS_HEIGHT;
  const coverScale = computeCoverScale(mediaW, mediaH);

  const bind = useCanvasStageGestures({
    liveSlideRef,
    stageScale,
    coverScale,
    editorMode,
    selectedLayerId,
    disabled: gesturesDisabled,
    onCommit: onCommitSlide,
    onSelectLayer,
    onLayerEditStart,
    onGestureStart,
    onGestureEnd,
    onGestureActiveChange,
    requestRedraw,
  });

  useLayoutEffect(() => {
    if (gestureActive) return;
    liveSlideRef.current = cloneSlideForLive(slide);
    requestRedraw();
  }, [gestureActive, liveSlideRef, requestRedraw, slide]);

  useEffect(() => {
    requestRedraw();
  }, [editorMode, selectedLayerId, requestRedraw]);

  const gestureProps = gesturesDisabled ? {} : bind();

  return (
    <div className="absolute inset-0 touch-none" {...gestureProps}>
      <StoryCanvasStage
        slide={slide}
        stageWidth={stageWidth}
        stageHeight={stageHeight}
        stageScale={stageScale}
        liveSlideRef={liveSlideRef}
        selectedLayerId={selectedLayerId}
        layersOnly={slide.media.type === 'VIDEO'}
        onMediaLoad={onLoadDimensions}
        onRegisterRedraw={registerRedraw}
      />
    </div>
  );
}
