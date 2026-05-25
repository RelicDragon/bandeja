import { useEffect, useRef, type CSSProperties } from 'react';
import type { StorySlide, Transform2D } from './types/storyEditor.types';
import { mediaAdjustToCssFilter } from './utils/storyAdjustFilters';
import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH, transformToCss } from './utils/storyTransform';
import { useStoryGestures } from './hooks/useStoryGestures';

type StoryMediaLayerProps = {
  slide: StorySlide;
  stageScale: number;
  defaultTransform: Transform2D;
  gesturesEnabled: boolean;
  onLoadDimensions: (w: number, h: number) => void;
  onTransformChange: (transform: Transform2D) => void;
  onResetTransform: () => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  onMediaGestureActiveChange?: (active: boolean) => void;
};

export function StoryMediaLayer({
  slide,
  stageScale,
  defaultTransform,
  gesturesEnabled,
  onLoadDimensions,
  onTransformChange,
  onResetTransform,
  onGestureStart,
  onGestureEnd,
  onMediaGestureActiveChange,
}: StoryMediaLayerProps) {
  const { media, mediaTransform, mediaAdjust } = slide;
  const mediaW = media.naturalWidth ?? STORY_CANVAS_WIDTH;
  const mediaH = media.naturalHeight ?? STORY_CANVAS_HEIGHT;

  const { bind: gestureBind, isMediaGestureActive } = useStoryGestures({
    transform: mediaTransform,
    defaultTransform,
    stageScale,
    onTransformChange,
    onReset: onResetTransform,
    onGestureStart,
    onGestureEnd,
    disabled: !gesturesEnabled,
  });

  const prevGestureActive = useRef(false);
  useEffect(() => {
    if (prevGestureActive.current === isMediaGestureActive) return;
    prevGestureActive.current = isMediaGestureActive;
    onMediaGestureActiveChange?.(isMediaGestureActive);
  }, [isMediaGestureActive, onMediaGestureActiveChange]);

  useEffect(() => {
    if (media.type === 'IMAGE') {
      const img = new Image();
      img.onload = () => onLoadDimensions(img.naturalWidth, img.naturalHeight);
      img.src = media.previewUrl;
      return;
    }
    const video = document.createElement('video');
    video.onloadedmetadata = () => onLoadDimensions(video.videoWidth, video.videoHeight);
    video.src = media.previewUrl;
  }, [media.previewUrl, media.type, onLoadDimensions]);

  const wrapperStyle: CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: mediaW * stageScale,
    height: mediaH * stageScale,
    transform: `${transformToCss(mediaTransform, stageScale)} translate(-50%, -50%)`,
    transformOrigin: 'center center',
    filter: mediaAdjustToCssFilter(mediaAdjust),
  };

  const bindProps = gesturesEnabled ? gestureBind() : {};

  return (
    <div
      {...bindProps}
      className="absolute inset-0 overflow-hidden touch-none"
    >
      <div style={wrapperStyle}>
        {media.type === 'VIDEO' ? (
          <video
            src={media.previewUrl}
            className="pointer-events-none h-full w-full object-cover"
            muted
            playsInline
            autoPlay
            loop
          />
        ) : (
          <img
            src={media.previewUrl}
            alt=""
            className="pointer-events-none h-full w-full select-none object-cover"
            draggable={false}
          />
        )}
      </div>
    </div>
  );
}
