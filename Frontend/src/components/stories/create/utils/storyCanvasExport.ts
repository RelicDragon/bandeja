import {
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
  buildOverlayStyleV2,
  type OverlayStyleV2,
  type StorySlide,
} from '../types/storyEditor.types';
import {
  drawComposition,
  drawMediaLayer,
  drawStickerOnCanvas,
  drawTextLayer,
  editorMediaCoverScale,
  getMediaLayerDrawParams,
  getStickerLayerDrawParams,
  getTextLayerDrawParams,
} from './storyCompositionDraw';

export {
  drawComposition,
  drawMediaLayer,
  drawStickerOnCanvas,
  drawTextLayer,
  editorMediaCoverScale,
  getMediaLayerDrawParams,
  getStickerLayerDrawParams,
  getTextLayerDrawParams,
};
export type { MediaLayerDrawParams, LayerDrawParams } from './storyCompositionDraw';

export const STORY_EXPORT_SIZE = { w: STORY_CANVAS_WIDTH, h: STORY_CANVAS_HEIGHT } as const;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function loadVideoFrame(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    let settled = false;

    const capture = () => {
      if (settled) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w < 2 || h < 2) return;
      settled = true;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.drawImage(video, 0, 0);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Frame decode failed'));
      img.src = canvas.toDataURL('image/jpeg', 0.92);
    };

    video.onerror = () => {
      if (!settled) reject(new Error('Video load failed'));
    };
    video.onloadedmetadata = () => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        clearTimeout(fallbackTimer);
        capture();
      };
      const fallbackTimer = setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        if (settled) return;
        capture();
        if (!settled) reject(new Error('Video frame not ready'));
      }, 1200);
      video.addEventListener('seeked', onSeeked);
      video.currentTime = 0;
    };
    video.src = src;
  });
}

export function overlayStyleFromSlide(slide: StorySlide): OverlayStyleV2 {
  return buildOverlayStyleV2(slide);
}

export async function exportStoryImage(
  slide: StorySlide,
  size = { w: STORY_CANVAS_WIDTH, h: STORY_CANVAS_HEIGHT }
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const img =
    slide.media.type === 'VIDEO'
      ? await loadVideoFrame(slide.media.previewUrl)
      : await loadImage(slide.media.previewUrl);

  drawComposition(ctx, slide, { mediaImage: img }, { width: size.w, height: size.h });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))),
      'image/jpeg',
      0.92
    );
  });
}
