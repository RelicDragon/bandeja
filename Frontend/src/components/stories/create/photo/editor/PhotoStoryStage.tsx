import type { ReactNode } from 'react';
import { StoryCompositionViewport } from '@/components/stories/StoryCompositionViewport';

type PhotoStoryStageProps = {
  children: (ctx: { stageScale: number }) => ReactNode;
  className?: string;
  gesturesDisabled?: boolean;
  stageGestureBind?: () => Record<string, unknown>;
  overlay?: ReactNode;
  onMeasure?: (size: { w: number; h: number }, frameRect: DOMRect) => void;
};

/** Edge-to-edge 9:16 canvas — no legacy “card in the middle” chrome. */
export function PhotoStoryStage({
  children,
  className,
  gesturesDisabled,
  stageGestureBind,
  overlay,
  onMeasure,
}: PhotoStoryStageProps) {
  const gestureProps = stageGestureBind?.() ?? {};

  return (
    <div
      className={`absolute inset-0 z-[10] bg-black ${className ?? ''}`}
      style={{ touchAction: gesturesDisabled ? 'auto' : 'none' }}
      {...gestureProps}
    >
      {overlay}
      <StoryCompositionViewport centerInStage onMeasure={onMeasure}>
        {({ frameScale }) => children({ stageScale: frameScale })}
      </StoryCompositionViewport>
    </div>
  );
}
