import { PHOTO_TEXT_FONT_PX, PHOTO_TEXT_MAX_WIDTH_PX } from '../constants';
import type { TextNode } from '../types';
import { drawTextNode, layoutCanvasText } from './canvasText';

const BITMAP_PAD = 40;

function bitmapPadding(node: TextNode, fontSize: number): number {
  let pad = BITMAP_PAD;
  if (node.style.id === 'blackBox') pad += fontSize * 0.5;
  if (node.style.id === 'neon') pad += fontSize * 0.4;
  if (node.style.id === 'classic') pad += fontSize * 0.2;
  return pad;
}

export type TextNodeBitmap = {
  image: HTMLCanvasElement;
  width: number;
  height: number;
};

export function renderTextNodeBitmap(
  text: string,
  style: TextNode['style'],
  scale: number
): TextNodeBitmap {
  const node: TextNode = {
    id: 'preview',
    type: 'text',
    text,
    style,
    transform: { x: 0, y: 0, scale, rotation: 0 },
  };
  const fontSize = PHOTO_TEXT_FONT_PX;
  const scale = Math.max(0.15, node.transform.scale);
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  if (!mctx) {
    const empty = document.createElement('canvas');
    empty.width = 4;
    empty.height = 4;
    return { image: empty, width: 4, height: 4 };
  }

  mctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  const layout = layoutCanvasText(mctx, node.text.trim() ? node.text : ' ', fontSize, PHOTO_TEXT_MAX_WIDTH_PX);
  const pad = bitmapPadding(node, fontSize);
  const contentW = layout.width + pad * 2;
  const contentH = layout.height + pad * 2;
  const width = Math.max(4, Math.ceil(contentW * scale));
  const height = Math.max(4, Math.ceil(contentH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { image: canvas, width, height };

  drawTextNode(ctx, {
    ...node,
    text: node.text.trim() ? node.text : ' ',
    transform: {
      x: width / (2 * scale),
      y: height / (2 * scale),
      scale,
      rotation: 0,
    },
  });

  return { image: canvas, width, height };
}
