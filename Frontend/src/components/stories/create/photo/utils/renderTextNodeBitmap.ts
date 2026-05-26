import type { TextNode } from '../types';
import { drawTextNode, measureTextNodeLayout, textNodeLocalBounds } from './canvasText';

export type TextNodeBitmap = {
  image: HTMLCanvasElement;
  width: number;
  height: number;
};

/** Base-resolution bitmap (scale 1). Apply `node.transform.scale` on the Konva group. */
export function renderTextNodeBitmap(text: string, style: TextNode['style']): TextNodeBitmap {
  const layout = measureTextNodeLayout(text);
  const local = textNodeLocalBounds(layout, style.id);
  const width = Math.max(4, Math.ceil(local.width));
  const height = Math.max(4, Math.ceil(local.height));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { image: canvas, width, height };

  drawTextNode(ctx, {
    id: 'preview',
    type: 'text',
    text: text.trim() ? text : ' ',
    style,
    transform: {
      x: local.width / 2,
      y: local.height / 2,
      scale: 1,
      rotation: 0,
    },
  });

  return { image: canvas, width, height };
}
