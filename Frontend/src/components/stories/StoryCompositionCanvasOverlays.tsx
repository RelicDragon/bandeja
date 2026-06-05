import { useCallback, useLayoutEffect, useRef } from 'react';
import type { OverlayStyleV2 } from '@/components/stories/create/types/storyEditor.types';
import { paintCompositionOverlaysToCanvas } from '@/components/stories/create/utils/storyCompositionViewport';

type StoryCompositionCanvasOverlaysProps = {
  overlayStyle: OverlayStyleV2;
  frameScale: number;
};

export function StoryCompositionCanvasOverlays({
  overlayStyle,
  frameScale,
}: StoryCompositionCanvasOverlaysProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    paintCompositionOverlaysToCanvas(canvas, overlayStyle, frameScale);
  }, [frameScale, overlayStyle]);

  useLayoutEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}
