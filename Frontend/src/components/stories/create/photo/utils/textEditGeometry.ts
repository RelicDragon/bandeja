import { PHOTO_TEXT_FONT_PX } from '../constants';
import type { TextNode } from '../types';

export type TextEditGeometry = {
  originX: number;
  originY: number;
  centerX: number;
  centerY: number;
  rotation: number;
  layerScale: number;
  fontSizePx: number;
};

export function computeTextEditGeometry(
  node: TextNode,
  stageRect: DOMRect,
  stageScale: number
): TextEditGeometry {
  const originX = stageRect.left + node.transform.x * stageScale;
  const originY = stageRect.top + node.transform.y * stageScale;
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight * 0.4;
  const fontSizePx = Math.max(18, PHOTO_TEXT_FONT_PX * node.transform.scale * stageScale);

  return {
    originX,
    originY,
    centerX,
    centerY,
    rotation: node.transform.rotation,
    layerScale: node.transform.scale,
    fontSizePx,
  };
}

export function textEditTransform(
  x: number,
  y: number,
  rotationDeg: number,
  scale: number
): string {
  return `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${rotationDeg}deg) scale(${scale})`;
}
