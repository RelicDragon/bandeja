import type { StoryMediaAdjust } from '../types';
import { mediaAdjustToCanvasFilter } from './storyPhotoFilters';

const PREVIEW_MAX_LONG_EDGE = 720;

/** Low-res filtered bitmap for editor preview — only call on adjust commit, not per slider tick. */
export async function buildPreviewFilteredImage(
  source: HTMLImageElement,
  adjust: StoryMediaAdjust
): Promise<HTMLImageElement> {
  const filter = mediaAdjustToCanvasFilter(adjust);
  if (filter === 'none') return source;

  const long = Math.max(source.naturalWidth, source.naturalHeight);
  const scale = long > PREVIEW_MAX_LONG_EDGE ? PREVIEW_MAX_LONG_EDGE / long : 1;
  const w = Math.round(source.naturalWidth * scale);
  const h = Math.round(source.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;

  ctx.filter = filter;
  ctx.drawImage(source, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85);
  });
  if (!blob) return source;

  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}
