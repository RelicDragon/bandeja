import type { TextNode } from '../types';
import { measureTextNodeLayout, textNodeLocalBounds, type CanvasTextLayout } from './canvasText';
import { PHOTO_TEXT_FONT_PX } from '../constants';

export type PhotoStoryTextMetrics = {
  layout: CanvasTextLayout;
  fontSize: number;
  boxWidth: number;
  boxHeight: number;
};

export function measurePhotoStoryText(
  text: string,
  style: TextNode['style'],
  layerScale: number
): PhotoStoryTextMetrics {
  const scale = Math.max(0.15, layerScale);
  const layout = measureTextNodeLayout(text);
  const local = textNodeLocalBounds(layout, style.id);
  return {
    layout,
    fontSize: PHOTO_TEXT_FONT_PX * scale,
    boxWidth: Math.max(4, Math.ceil(local.width * scale)),
    boxHeight: Math.max(4, Math.ceil(local.height * scale)),
  };
}
