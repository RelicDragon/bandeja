import type { CSSProperties, ReactNode } from 'react';
import type { StoryMediaAdjust, Transform2D } from '@/components/stories/create/types/storyEditor.types';
import { mediaWrapperStyle } from '@/components/stories/create/utils/storyCompositionLayout';

type StoryCompositionMediaProps = {
  frameScale: number;
  mediaTransform: Transform2D;
  mediaAdjust: StoryMediaAdjust;
  naturalWidth: number;
  naturalHeight: number;
  children: ReactNode;
  wrapperClassName?: string;
  hostClassName?: string;
};

export function StoryCompositionMedia({
  frameScale,
  mediaTransform,
  mediaAdjust,
  naturalWidth,
  naturalHeight,
  children,
  wrapperClassName,
  hostClassName = 'absolute inset-0 overflow-hidden touch-none',
}: StoryCompositionMediaProps) {
  const wrapperStyle: CSSProperties = mediaWrapperStyle(
    mediaTransform,
    naturalWidth,
    naturalHeight,
    frameScale,
    mediaAdjust
  );

  return (
    <div className={hostClassName}>
      <div className={wrapperClassName} style={wrapperStyle}>
        {children}
      </div>
    </div>
  );
}

export const STORY_COMPOSITION_MEDIA_FILL_CLASS = 'pointer-events-none h-full w-full object-cover';
