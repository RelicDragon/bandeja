import { useEffect, useRef } from 'react';
import type { StorySlide, Transform2D } from './types/storyEditor.types';
import { mediaWrapperStyle } from './utils/storyCompositionLayout';
import { useStoryGestures } from './hooks/useStoryGestures';
import { computeCoverScale } from './utils/storyTransform';
import { STORY_COMPOSITION_MEDIA_FILL_CLASS } from '@/components/stories/StoryCompositionMedia';

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
  const mediaW = media.naturalWidth ?? 0;
  const mediaH = media.naturalHeight ?? 0;
  const coverScale = computeCoverScale(mediaW, mediaH);

  const { bind: gestureBind, isMediaGestureActive } = useStoryGestures({
    transform: mediaTransform,
    defaultTransform,
    stageScale,
    coverScale,
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

  const wrapperStyle = mediaWrapperStyle(
    mediaTransform,
    mediaW,
    mediaH,
    stageScale,
    mediaAdjust
  );

  const bindProps = gesturesEnabled ? gestureBind() : {};

  return (
    <div {...bindProps} className="absolute inset-0 overflow-hidden touch-none">
      <div style={wrapperStyle}>
        {media.type === 'VIDEO' ? (
          <video
            src={media.previewUrl}
            className={STORY_COMPOSITION_MEDIA_FILL_CLASS}
            muted
            playsInline
            autoPlay
            loop
          />
        ) : (
          <img
            src={media.previewUrl}
            alt=""
            className={STORY_COMPOSITION_MEDIA_FILL_CLASS}
            draggable={false}
          />
        )}
      </div>
    </div>
  );
}
