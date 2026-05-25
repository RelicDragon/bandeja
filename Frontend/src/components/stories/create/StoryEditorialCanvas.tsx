import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { stageScaleFromWidth } from './utils/storyTransform';

type StoryEditorialCanvasProps = {
  children: (ctx: { stageScale: number; stageRect: DOMRect | null }) => ReactNode;
  gesturesDisabled?: boolean;
  keyboardBottomInset?: number;
  onStageMeasure?: (size: { w: number; h: number }) => void;
};

export function StoryEditorialCanvas({
  children,
  gesturesDisabled,
  keyboardBottomInset = 0,
  onStageMeasure,
}: StoryEditorialCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageScale, setStageScale] = useState(0.3);
  const [stageRect, setStageRect] = useState<DOMRect | null>(null);

  const measure = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setStageRect(rect);
    setStageScale(stageScaleFromWidth(rect.width));
    onStageMeasure?.({ w: rect.width, h: rect.height });
  }, [onStageMeasure]);

  useLayoutEffect(() => {
    measure();
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div
      className="flex-1 flex items-center justify-center min-h-0 px-2 transition-[padding] duration-200"
      style={{ paddingBottom: keyboardBottomInset > 0 ? `${keyboardBottomInset}px` : undefined }}
    >
      <div
        ref={stageRef}
        data-story-stage
        className="relative aspect-[9/16] w-full max-h-[max(55dvh,calc(100dvh-220px))] max-w-[min(100%,calc((100dvh-220px)*9/16))] bg-black overflow-hidden rounded-xl shadow-2xl"
        style={{
          touchAction: gesturesDisabled ? 'auto' : 'none',
          maxHeight:
            keyboardBottomInset > 0
              ? `max(55dvh, calc(100dvh - 220px - ${keyboardBottomInset}px))`
              : undefined,
        }}
      >
        {children({ stageScale, stageRect })}
      </div>
    </div>
  );
}
