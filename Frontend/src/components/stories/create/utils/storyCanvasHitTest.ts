import type { StoryLayer, StickerStoryLayer, TextStoryLayer } from '../types/storyEditor.types';
import { STORY_STICKER_BASE_FONT_PX } from '../storySticker.constants';
import { layoutCanvasText } from './layoutCanvasText';
import { STORY_TEXT_BASE_CANVAS_PX, applyCanvasTextStyle } from './storyTextStyles';

let measureCtx: CanvasRenderingContext2D | null = null;

export function getCanvasMeasureCtx(): CanvasRenderingContext2D {
  if (measureCtx) return measureCtx;
  const canvas = document.createElement('canvas');
  measureCtx = canvas.getContext('2d')!;
  return measureCtx;
}

export function screenPointToCanvas(
  clientX: number,
  clientY: number,
  rect: DOMRect
): { x: number; y: number } {
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  return {
    x: (localX / rect.width) * 1080,
    y: (localY / rect.height) * 1920,
  };
}

const EMPTY_TEXT_HIT_W = 280;
const EMPTY_TEXT_HIT_H = 72;

export function hitTestTextLayer(
  ctx: CanvasRenderingContext2D,
  layer: TextStoryLayer,
  canvasX: number,
  canvasY: number
): boolean {
  if (!layer.text.trim() && !layer.text.includes('\n')) {
    const { transform: t } = layer;
    const dx = canvasX - t.x;
    const dy = canvasY - t.y;
    const rad = (-t.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const lx = (dx * cos - dy * sin) / t.scale;
    const ly = (dx * sin + dy * cos) / t.scale;
    const halfW = EMPTY_TEXT_HIT_W / 2;
    const halfH = EMPTY_TEXT_HIT_H / 2;
    return lx >= -halfW && lx <= halfW && ly >= -halfH && ly <= halfH;
  }
  const { transform: t, style } = layer;
  const fontSize = STORY_TEXT_BASE_CANVAS_PX;
  applyCanvasTextStyle(ctx, style.id, fontSize, style.align);
  const layout = layoutCanvasText(ctx, layer.text, fontSize);

  const dx = canvasX - t.x;
  const dy = canvasY - t.y;
  const rad = (-t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const lx = (dx * cos - dy * sin) / t.scale;
  const ly = (dx * sin + dy * cos) / t.scale;

  const halfW = layout.width / 2 + (style.id === 'blackBox' ? fontSize * 0.45 : 0);
  const halfH = layout.height / 2 + (style.id === 'blackBox' ? fontSize * 0.35 : 0);
  return lx >= -halfW && lx <= halfW && ly >= -halfH && ly <= halfH;
}

export function hitTestStickerLayer(
  layer: StickerStoryLayer,
  canvasX: number,
  canvasY: number
): boolean {
  const { transform: t } = layer;
  const radius = (STORY_STICKER_BASE_FONT_PX * t.scale) / 2;
  const dx = canvasX - t.x;
  const dy = canvasY - t.y;
  return dx * dx + dy * dy <= radius * radius;
}

export function hitTestLayerAtPoint(
  layers: StoryLayer[],
  canvasX: number,
  canvasY: number,
  ctx: CanvasRenderingContext2D = getCanvasMeasureCtx()
): StoryLayer | null {
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const layer = layers[i]!;
    if (layer.type === 'text' && hitTestTextLayer(ctx, layer, canvasX, canvasY)) return layer;
    if (layer.type === 'sticker' && hitTestStickerLayer(layer, canvasX, canvasY)) return layer;
  }
  return null;
}
