import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { stageScaleFromWidth } from '../utils/transform';

type PhotoStoryStageProps = {
  children: (ctx: { stageScale: number }) => ReactNode;
  gesturesDisabled?: boolean;
  overlay?: ReactNode;
  onMeasure?: (size: { w: number; h: number }, frameRect: DOMRect) => void;
};

/** Edge-to-edge 9:16 canvas — no legacy “card in the middle” chrome. */
export function PhotoStoryStage({
  children,
  gesturesDisabled,
  overlay,
  onMeasure,
}: PhotoStoryStageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [stageScale, setStageScale] = useState(0.33);

  const measure = useCallback(() => {
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setStageScale(stageScaleFromWidth(rect.width));
    onMeasure?.({ w: rect.width, h: rect.height }, rect);
  }, [onMeasure]);

  useLayoutEffect(() => {
    measure();
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div
      ref={frameRef}
      className="absolute inset-0 z-0 bg-black"
      style={{ touchAction: gesturesDisabled ? 'auto' : 'none' }}
    >
      {children({ stageScale })}
      {overlay}
    </div>
  );
}
