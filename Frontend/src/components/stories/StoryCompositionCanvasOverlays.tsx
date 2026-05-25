import { useCallback, useLayoutEffect, useRef } from 'react';
import {
  DEFAULT_MEDIA_ADJUST,
  DEFAULT_TRANSFORM,
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
  type OverlayStyleV2,
  type StorySlide,
} from '@/components/stories/create/types/storyEditor.types';
import { drawComposition } from '@/components/stories/create/utils/storyCompositionDraw';

function overlayStyleToSlide(overlay: OverlayStyleV2): StorySlide {
  return {
    id: 'viewer-overlay',
    media: {
      file: new File([], 'viewer'),
      type: 'IMAGE',
      previewUrl: '',
      naturalWidth: overlay.sourceWidth ?? STORY_CANVAS_WIDTH,
      naturalHeight: overlay.sourceHeight ?? STORY_CANVAS_HEIGHT,
    },
    mediaTransform: overlay.mediaTransform ?? DEFAULT_TRANSFORM,
    mediaAdjust: overlay.mediaAdjust ?? DEFAULT_MEDIA_ADJUST,
    layers: overlay.layers ?? [],
  };
}

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
    const frameW = STORY_CANVAS_WIDTH * frameScale;
    const frameH = STORY_CANVAS_HEIGHT * frameScale;
    if (frameW <= 0 || frameH <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const bitmapW = Math.round(frameW * dpr);
    const bitmapH = Math.round(frameH * dpr);
    if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
      canvas.width = bitmapW;
      canvas.height = bitmapH;
    }

    const ctx = canvas.getContext('2d', { desynchronized: true });
    if (!ctx) return;
    ctx.setTransform(0, 0, 0, 0, 0, 0);
    ctx.clearRect(0, 0, bitmapW, bitmapH);
    ctx.setTransform(frameScale * dpr, 0, 0, frameScale * dpr, 0, 0);
    drawComposition(ctx, overlayStyleToSlide(overlayStyle), { skipMedia: true }, {
      transparentBackground: true,
      skipMedia: true,
    });
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
