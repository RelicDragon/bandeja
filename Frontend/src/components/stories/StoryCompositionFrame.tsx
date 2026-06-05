import type { ReactNode } from 'react';
import { StoryCompositionViewport } from '@/components/stories/StoryCompositionViewport';

type StoryCompositionFrameProps = {
  className?: string;
  children: (ctx: { frameScale: number }) => ReactNode;
};

export function StoryCompositionFrame({ className, children }: StoryCompositionFrameProps) {
  return (
    <StoryCompositionViewport className={className}>
      {({ frameScale }) => children({ frameScale })}
    </StoryCompositionViewport>
  );
}
