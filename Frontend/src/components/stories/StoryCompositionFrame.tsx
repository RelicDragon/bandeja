import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  STORY_COMPOSITION_FRAME_CLASS,
  viewportScaleFromFrameWidth,
} from '@/components/stories/create/utils/storyCompositionLayout';

type StoryCompositionFrameProps = {
  className?: string;
  children: (ctx: { frameScale: number }) => ReactNode;
};

export function StoryCompositionFrame({ className, children }: StoryCompositionFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameScale, setFrameScale] = useState(() => viewportScaleFromFrameWidth(360));

  const measure = useCallback(() => {
    const el = frameRef.current;
    if (!el) return;
    const w = el.getBoundingClientRect().width;
    if (w > 0) setFrameScale(viewportScaleFromFrameWidth(w));
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div ref={frameRef} className={className ?? STORY_COMPOSITION_FRAME_CLASS}>
      {children({ frameScale })}
    </div>
  );
}
