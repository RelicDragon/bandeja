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

/**
 * Full-bleed stage. `touch-action: none` + overscroll lock is required so
 * Capacitor / mobile Safari don't steal pinch-pan for page zoom/scroll.
 */
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
      className={`absolute inset-0 z-[10] bg-black touch-none overscroll-none select-none ${className ?? ''}`}
      style={{
        touchAction: gesturesDisabled ? 'auto' : 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
      {...gestureProps}
    >
      {overlay}
      <StoryCompositionViewport onMeasure={onMeasure}>
        {({ frameScale }) => children({ stageScale: frameScale })}
      </StoryCompositionViewport>
    </div>
  );
}
