import type { StoryDocument } from '../types';
import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH } from '../types';
import { getMediaNode } from './document';
import { renderDocument } from './renderDocument';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function drawScene(
  doc: StoryDocument,
  size = { w: STORY_CANVAS_WIDTH, h: STORY_CANVAS_HEIGHT }
): Promise<Blob> {
  const media = getMediaNode(doc);
  if (!media) throw new Error('StoryDocument missing media');

  const img = await loadImage(media.source.previewUrl);
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const scaleX = size.w / STORY_CANVAS_WIDTH;
  const scaleY = size.h / STORY_CANVAS_HEIGHT;
  ctx.scale(scaleX, scaleY);
  renderDocument(ctx, doc, img);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))),
      'image/jpeg',
      0.92
    );
  });
}
