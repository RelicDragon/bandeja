import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH } from './transform';

export type PixelCropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function isLocalObjectUrl(src: string): boolean {
  return src.startsWith('blob:') || src.startsWith('data:');
}

/**
 * Load image for canvas crop. Skip crossOrigin on blob/data URLs —
 * Safari / Capacitor WKWebView can fail or taint otherwise.
 */
export function loadImageForStoryCrop(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!isLocalObjectUrl(src)) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => {
      const ready = typeof image.decode === 'function' ? image.decode() : Promise.resolve();
      void ready.then(() => resolve(image)).catch(() => resolve(image));
    };
    image.onerror = () => reject(new Error('Failed to load image for crop'));
    image.src = src;
  });
}

function clampPixelCrop(
  crop: PixelCropArea,
  imageWidth: number,
  imageHeight: number
): PixelCropArea {
  const maxW = Math.max(1, imageWidth);
  const maxH = Math.max(1, imageHeight);
  const x = Math.min(Math.max(0, Math.floor(crop.x)), maxW - 1);
  const y = Math.min(Math.max(0, Math.floor(crop.y)), maxH - 1);
  const width = Math.min(Math.max(1, Math.round(crop.width)), maxW - x);
  const height = Math.min(Math.max(1, Math.round(crop.height)), maxH - y);
  return { x, y, width, height };
}

/** JPEG blob from canvas — toBlob can return null on some iOS WebViews; fall back to toDataURL. */
export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const finishFromDataUrl = () => {
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const comma = dataUrl.indexOf(',');
        if (comma < 0) {
          reject(new Error('toDataURL failed'));
          return;
        }
        const binary = atob(dataUrl.slice(comma + 1));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        resolve(new Blob([bytes], { type: 'image/jpeg' }));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('JPEG encode failed'));
      }
    };

    try {
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) resolve(blob);
          else finishFromDataUrl();
        },
        'image/jpeg',
        quality
      );
    } catch {
      finishFromDataUrl();
    }
  });
}

/**
 * Rasterize a 9:16 pixel crop into the story canvas (1080×1920).
 * Same path for desktop, mobile browser, and Capacitor WebViews.
 */
export async function cropToStoryCanvas(
  imageSrc: string,
  pixelCrop: PixelCropArea
): Promise<{ file: File; width: number; height: number }> {
  if (pixelCrop.width <= 0 || pixelCrop.height <= 0) {
    throw new Error('invalid crop area');
  }

  const image = await loadImageForStoryCrop(imageSrc);
  const imageW = image.naturalWidth || image.width;
  const imageH = image.naturalHeight || image.height;
  if (imageW <= 0 || imageH <= 0) {
    throw new Error('invalid image dimensions');
  }

  const crop = clampPixelCrop(pixelCrop, imageW, imageH);

  const canvas = document.createElement('canvas');
  canvas.width = STORY_CANVAS_WIDTH;
  canvas.height = STORY_CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context not available');

  // Avoid subpixel smoothing differences across WebKit / Chromium where possible.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, STORY_CANVAS_WIDTH, STORY_CANVAS_HEIGHT);
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    STORY_CANVAS_WIDTH,
    STORY_CANVAS_HEIGHT
  );

  const blob = await canvasToJpegBlob(canvas, 0.92);
  const file = new File([blob], `story-crop-${Date.now()}.jpg`, { type: 'image/jpeg' });

  return {
    file,
    width: STORY_CANVAS_WIDTH,
    height: STORY_CANVAS_HEIGHT,
  };
}
