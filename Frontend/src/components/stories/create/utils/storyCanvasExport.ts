import {
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
  type OverlayStyleV2,
  type StickerStoryLayer,
  type StorySlide,
  type TextStoryLayer,
} from '../types/storyEditor.types';
import { STORY_STICKER_BASE_FONT_PX } from '../storySticker.constants';
import { mediaAdjustToCanvasFilter } from './storyAdjustFilters';
import { STORY_TEXT_BASE_CANVAS_PX, drawCanvasTextWithPreset } from './storyTextStyles';
import { computeCoverScale } from './storyTransform';

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

export type MediaLayerDrawParams = {
  translate: [number, number];
  rotation: number;
  scale: [number, number];
  imageRect: [number, number, number, number];
  filter: string;
};

export type LayerDrawParams = {
  translate: [number, number];
  rotation: number;
  scale: [number, number];
  fontSize: number;
};

export function getMediaLayerDrawParams(slide: StorySlide): MediaLayerDrawParams {
  const { mediaTransform: t, media } = slide;
  const mediaW = media.naturalWidth ?? 0;
  const mediaH = media.naturalHeight ?? 0;
  return {
    translate: [STORY_CANVAS_WIDTH / 2 + t.x, STORY_CANVAS_HEIGHT / 2 + t.y],
    rotation: t.rotation,
    scale: [t.scale, t.scale],
    imageRect: [-mediaW / 2, -mediaH / 2, mediaW, mediaH],
    filter: mediaAdjustToCanvasFilter(slide.mediaAdjust),
  };
}

export function getTextLayerDrawParams(layer: TextStoryLayer): LayerDrawParams {
  const { transform: t } = layer;
  return {
    translate: [t.x, t.y],
    rotation: t.rotation,
    scale: [t.scale, t.scale],
    fontSize: STORY_TEXT_BASE_CANVAS_PX,
  };
}

export function getStickerLayerDrawParams(layer: StickerStoryLayer): LayerDrawParams {
  const { transform: t } = layer;
  return {
    translate: [t.x, t.y],
    rotation: t.rotation,
    scale: [t.scale, t.scale],
    fontSize: STORY_STICKER_BASE_FONT_PX,
  };
}

export function editorMediaCoverScale(slide: StorySlide): number {
  const w = slide.media.naturalWidth ?? 0;
  const h = slide.media.naturalHeight ?? 0;
  return computeCoverScale(w, h);
}

function applyMediaAdjustFilter(ctx: CanvasRenderingContext2D, slide: StorySlide): void {
  ctx.filter = mediaAdjustToCanvasFilter(slide.mediaAdjust);
}

function drawMediaLayer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  slide: StorySlide
): void {
  const { mediaTransform: t } = slide;
  const mediaW = slide.media.naturalWidth ?? img.naturalWidth;
  const mediaH = slide.media.naturalHeight ?? img.naturalHeight;

  ctx.save();
  applyMediaAdjustFilter(ctx, slide);
  ctx.translate(STORY_CANVAS_WIDTH / 2 + t.x, STORY_CANVAS_HEIGHT / 2 + t.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scale, t.scale);
  ctx.drawImage(img, -mediaW / 2, -mediaH / 2, mediaW, mediaH);
  ctx.restore();
  ctx.filter = 'none';
}

function drawTextLayer(ctx: CanvasRenderingContext2D, layer: TextStoryLayer): void {
  if (!layer.text.trim()) return;
  const { transform: t, style } = layer;

  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scale, t.scale);
  drawCanvasTextWithPreset(ctx, layer.text, style.id, STORY_TEXT_BASE_CANVAS_PX, style.align, 0, 0);
  ctx.restore();
}

export function drawStickerOnCanvas(ctx: CanvasRenderingContext2D, layer: StickerStoryLayer): void {
  const { transform: t } = layer;

  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scale, t.scale);
  ctx.font = `${STORY_STICKER_BASE_FONT_PX}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(layer.emoji, 0, 0);
  ctx.restore();
}

export function overlayStyleFromSlide(slide: StorySlide): OverlayStyleV2 {
  return {
    version: 2,
    canvas: { width: 1080, height: 1920 },
    mediaTransform: slide.mediaTransform,
    layers: slide.layers.length > 0 ? slide.layers : undefined,
  };
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

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size.w, size.h);

  const img =
    slide.media.type === 'VIDEO'
      ? await loadVideoFrame(slide.media.previewUrl)
      : await loadImage(slide.media.previewUrl);

  drawMediaLayer(ctx, img, slide);

  for (const layer of slide.layers) {
    if (layer.type === 'text') drawTextLayer(ctx, layer);
    else if (layer.type === 'sticker') drawStickerOnCanvas(ctx, layer);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))),
      'image/jpeg',
      0.92
    );
  });
}
