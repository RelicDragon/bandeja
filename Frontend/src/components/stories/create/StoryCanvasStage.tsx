import { useCallback, useEffect, useRef } from 'react';
import {
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
  type StorySlide,
} from './types/storyEditor.types';
import { drawComposition } from './utils/storyCompositionDraw';
import {
  clearSlideMediaAssetCache,
  getCachedSlideMediaAsset,
  getSlideMediaAsset,
  invalidateSlideMediaAsset,
} from './utils/storyCompositionAssetCache';
import { mediaWrapperStyle } from './utils/storyCompositionLayout';

type StoryCanvasStageProps = {
  slide: StorySlide;
  stageWidth: number;
  stageHeight: number;
  stageScale: number;
  liveSlideRef: React.RefObject<StorySlide | null>;
  selectedLayerId?: string | null;
  layersOnly?: boolean;
  onMediaLoad?: (w: number, h: number) => void;
  onRegisterRedraw?: (draw: () => void) => void;
};

export function StoryCanvasStage({
  slide,
  stageWidth,
  stageHeight,
  stageScale,
  liveSlideRef,
  layersOnly = false,
  selectedLayerId = null,
  onMediaLoad,
  onRegisterRedraw,
}: StoryCanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoWrapperRef = useRef<HTMLDivElement>(null);
  const previewUrlRef = useRef(slide.media.previewUrl);
  const stageScaleRef = useRef(stageScale);
  stageScaleRef.current = stageScale;

  const applyVideoWrapperStyle = useCallback((current: StorySlide) => {
    const wrapper = videoWrapperRef.current;
    if (!wrapper || current.media.type !== 'VIDEO') return;
    const nw = current.media.naturalWidth ?? STORY_CANVAS_WIDTH;
    const nh = current.media.naturalHeight ?? STORY_CANVAS_HEIGHT;
    const style = mediaWrapperStyle(
      current.mediaTransform,
      nw,
      nh,
      stageScaleRef.current,
      current.mediaAdjust
    );
    Object.assign(wrapper.style, style);
  }, []);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d', { desynchronized: true });
      const current = liveSlideRef.current ?? slide;
      if (!canvas || !ctx || stageWidth <= 0 || stageHeight <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      const bitmapW = Math.round(stageWidth * dpr);
      const bitmapH = Math.round(stageHeight * dpr);
      if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
        canvas.width = bitmapW;
        canvas.height = bitmapH;
      }

      ctx.setTransform(0, 0, 0, 0, 0, 0);
      ctx.clearRect(0, 0, bitmapW, bitmapH);
      const previewScale = stageWidth / STORY_CANVAS_WIDTH;
      ctx.setTransform(previewScale * dpr, 0, 0, previewScale * dpr, 0, 0);

      const mediaImage = getCachedSlideMediaAsset(current.media.previewUrl);
      drawComposition(ctx, current, {
        mediaImage: layersOnly ? null : mediaImage,
        skipMedia: layersOnly || current.media.type === 'VIDEO',
      }, { selectedLayerId });

      applyVideoWrapperStyle(current);
    });
  }, [applyVideoWrapperStyle, liveSlideRef, layersOnly, selectedLayerId, slide, stageHeight, stageWidth]);

  useEffect(() => {
    onRegisterRedraw?.(scheduleDraw);
  }, [onRegisterRedraw, scheduleDraw]);

  useEffect(() => {
    if (previewUrlRef.current !== slide.media.previewUrl) {
      invalidateSlideMediaAsset(previewUrlRef.current);
      previewUrlRef.current = slide.media.previewUrl;
    }

    if (slide.media.type === 'VIDEO') {
      scheduleDraw();
      return;
    }

    let cancelled = false;
    void getSlideMediaAsset(slide.media.previewUrl)
      .then((img) => {
        if (cancelled) return;
        const w = img instanceof ImageBitmap ? img.width : img.naturalWidth;
        const h = img instanceof ImageBitmap ? img.height : img.naturalHeight;
        onMediaLoad?.(w, h);
        scheduleDraw();
      })
      .catch(() => scheduleDraw());

    return () => {
      cancelled = true;
    };
  }, [onMediaLoad, scheduleDraw, slide.media.previewUrl, slide.media.type]);

  useEffect(() => {
    scheduleDraw();
  }, [slide, stageWidth, stageHeight, stageScale, scheduleDraw]);

  useEffect(() => () => clearSlideMediaAssetCache(), []);

  useEffect(() => {
    applyVideoWrapperStyle(liveSlideRef.current ?? slide);
  }, [applyVideoWrapperStyle, liveSlideRef, slide, stageScale]);

  return (
    <>
      {slide.media.type === 'VIDEO' ? (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div ref={videoWrapperRef}>
            <video
              ref={videoRef}
              src={slide.media.previewUrl}
              className="block w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
            />
          </div>
        </div>
      ) : null}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        style={{ pointerEvents: 'none' }}
      />
    </>
  );
}
