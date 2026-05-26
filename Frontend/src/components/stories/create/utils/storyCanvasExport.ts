import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH, type StorySlide } from '../types/storyEditor.types';
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

export async function exportStoryImage(
  slide: StorySlide,
  size = { w: STORY_CANVAS_WIDTH, h: STORY_CANVAS_HEIGHT }
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  if (slide.media.type !== 'IMAGE') {
    throw new Error('exportStoryImage supports IMAGE slides only');
  }
  const img = await loadImage(slide.media.previewUrl);

  drawComposition(ctx, slide, { mediaImage: img }, { width: size.w, height: size.h });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))),
      'image/jpeg',
      0.92
    );
  });
}
