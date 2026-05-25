import {
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
  type StickerStoryLayer,
  type StoryLayer,
  type StorySlide,
  type TextStoryLayer,
} from '../types/storyEditor.types';
import { STORY_STICKER_BASE_FONT_PX } from '../storySticker.constants';
import { mediaAdjustToCanvasFilter } from './storyAdjustFilters';
import { layoutCanvasText } from './layoutCanvasText';
import {
  STORY_TEXT_BASE_CANVAS_PX,
  applyCanvasTextStyle,
  drawCanvasTextWithPreset,
} from './storyTextStyles';
import { computeCoverScale } from './storyTransform';

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

export type CompositionAssets = {
  mediaImage?: HTMLImageElement | ImageBitmap | null;
  skipMedia?: boolean;
};

export type DrawCompositionOptions = {
  width?: number;
  height?: number;
  skipMedia?: boolean;
  selectedLayerId?: string | null;
  transparentBackground?: boolean;
};

function layerSelectionBounds(ctx: CanvasRenderingContext2D, layer: StoryLayer): {
  x: number;
  y: number;
  w: number;
  h: number;
} | null {
  const { transform: t } = layer;
  if (layer.type === 'text') {
    if (!layer.text.trim() && !layer.text.includes('\n')) return null;
    const fontSize = STORY_TEXT_BASE_CANVAS_PX;
    applyCanvasTextStyle(ctx, layer.style.id, fontSize, layer.style.align);
    const layout = layoutCanvasText(ctx, layer.text, fontSize);
    const padX = layer.style.id === 'blackBox' ? fontSize * 0.45 : 8;
    const padY = layer.style.id === 'blackBox' ? fontSize * 0.35 : 8;
    return { x: t.x, y: t.y, w: (layout.width + padX * 2) * t.scale, h: (layout.height + padY * 2) * t.scale };
  }
  const size = STORY_STICKER_BASE_FONT_PX * t.scale;
  return { x: t.x, y: t.y, w: size, h: size };
}

export function drawLayerSelection(ctx: CanvasRenderingContext2D, layer: StoryLayer): void {
  const bounds = layerSelectionBounds(ctx, layer);
  if (!bounds) return;
  const { transform: t } = layer;
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(-bounds.w / 2, -bounds.h / 2, bounds.w, bounds.h);
  ctx.restore();
}

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

export function drawMediaLayer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | ImageBitmap,
  slide: StorySlide
): void {
  const { mediaTransform: t } = slide;
  const mediaW = slide.media.naturalWidth ?? ('naturalWidth' in img ? img.naturalWidth : img.width);
  const mediaH = slide.media.naturalHeight ?? ('naturalHeight' in img ? img.naturalHeight : img.height);

  ctx.save();
  applyMediaAdjustFilter(ctx, slide);
  ctx.translate(STORY_CANVAS_WIDTH / 2 + t.x, STORY_CANVAS_HEIGHT / 2 + t.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scale, t.scale);
  ctx.drawImage(img, -mediaW / 2, -mediaH / 2, mediaW, mediaH);
  ctx.restore();
  ctx.filter = 'none';
}

function drawTextLineWithPreset(
  ctx: CanvasRenderingContext2D,
  line: string,
  presetId: TextStoryLayer['style']['id'],
  fontSize: number,
  align: TextStoryLayer['style']['align'],
  x: number,
  y: number
): void {
  if (!line) return;
  drawCanvasTextWithPreset(ctx, line, presetId, fontSize, align, x, y);
}

export function drawTextLayer(ctx: CanvasRenderingContext2D, layer: TextStoryLayer): void {
  if (!layer.text.trim() && !layer.text.includes('\n')) return;
  const { transform: t, style } = layer;
  const fontSize = STORY_TEXT_BASE_CANVAS_PX;

  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scale, t.scale);

  applyCanvasTextStyle(ctx, style.id, fontSize, style.align);
  const layout = layoutCanvasText(ctx, layer.text, fontSize);
  const startY = -layout.height / 2 + layout.lineHeight / 2;

  if (style.id === 'blackBox' && layout.lines.some((l) => l.text)) {
    const padX = fontSize * 0.45;
    const padY = fontSize * 0.35;
    const boxW = layout.width + padX * 2;
    const boxH = layout.height + padY * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 12);
    ctx.fill();
  }

  layout.lines.forEach((line, i) => {
    const y = startY + i * layout.lineHeight;
    let x = 0;
    if (style.align === 'left') x = -layout.width / 2 + line.width / 2;
    else if (style.align === 'right') x = layout.width / 2 - line.width / 2;
    drawTextLineWithPreset(ctx, line.text, style.id, fontSize, style.align, x, y);
  });

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

export function drawComposition(
  ctx: CanvasRenderingContext2D,
  slide: StorySlide,
  assets: CompositionAssets = {},
  options: DrawCompositionOptions = {}
): void {
  const w = options.width ?? STORY_CANVAS_WIDTH;
  const h = options.height ?? STORY_CANVAS_HEIGHT;
  const skipMedia = options.skipMedia ?? assets.skipMedia ?? false;
  const transparent = options.transparentBackground ?? false;

  if (!transparent) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.clearRect(0, 0, w, h);
  }

  if (!skipMedia && assets.mediaImage) {
    drawMediaLayer(ctx, assets.mediaImage, slide);
  }

  for (const layer of slide.layers) {
    if (layer.type === 'text') drawTextLayer(ctx, layer);
    else if (layer.type === 'sticker') drawStickerOnCanvas(ctx, layer);
  }

  if (options.selectedLayerId) {
    const selected = slide.layers.find((l) => l.id === options.selectedLayerId);
    if (selected) drawLayerSelection(ctx, selected);
  }
}
