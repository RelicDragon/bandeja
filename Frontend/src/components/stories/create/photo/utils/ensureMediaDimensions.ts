import type { StoryDocument } from '../types';
import { getMediaNode, patchMediaDimensions } from './document';
import { defaultMediaTransform } from './transform';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function ensureDocumentMediaDimensions(doc: StoryDocument): Promise<StoryDocument> {
  const media = getMediaNode(doc);
  if (!media) return doc;
  if (media.source.naturalWidth != null && media.source.naturalHeight != null) return doc;

  const img = await loadImage(media.source.previewUrl);
  const w = img.naturalWidth > 0 ? img.naturalWidth : 1080;
  const h = img.naturalHeight > 0 ? img.naturalHeight : 1920;
  return patchMediaDimensions(doc, w, h, defaultMediaTransform(w, h));
}
