import { getRadianAngle, rotateSize } from './cropUtils';
import { clampPixelCrop, type PixelCrop } from './avatarCropArea';

export const AVATAR_EXPORT_SIZE = 200;
export const ORIGINAL_MAX_DIMENSION = 1920;

function isLocalObjectUrl(src: string): boolean {
  return src.startsWith('blob:') || src.startsWith('data:');
}

export function loadImageForAvatarCrop(src: string): Promise<HTMLImageElement> {
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

function dataUrlToBlob(dataUrl: string, fallbackType: string): Blob {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) {
    throw new Error('toDataURL failed');
  }
  const header = dataUrl.slice(0, comma);
  const mimeMatch = /data:([^;]+)/.exec(header);
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeMatch?.[1] || fallbackType });
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg',
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const finishFromDataUrl = () => {
      try {
        resolve(dataUrlToBlob(canvas.toDataURL(type, quality), type));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('canvas encode failed'));
      }
    };

    try {
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) resolve(blob);
          else finishFromDataUrl();
        },
        type,
        quality
      );
    } catch {
      finishFromDataUrl();
    }
  });
}

function drawCircularAvatar(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  crop: PixelCrop,
  rotation: number
) {
  const size = AVATAR_EXPORT_SIZE;
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (rotation === 0) {
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, size, size);
  } else {
    const scale = size / crop.width;
    const rotRad = getRadianAngle(rotation);
    const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
      image.width,
      image.height,
      rotation
    );
    ctx.translate(-crop.x * scale, -crop.y * scale);
    ctx.scale(scale, scale);
    ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
    ctx.rotate(rotRad);
    ctx.translate(-image.width / 2, -image.height / 2);
    ctx.drawImage(image, 0, 0);
  }
  ctx.restore();
}

export async function exportCircularAvatarPng(
  image: HTMLImageElement,
  pixelCrop: PixelCrop,
  rotation = 0
): Promise<Blob> {
  const { width: bboxW, height: bboxH } = rotateSize(image.width, image.height, rotation);
  const crop = clampPixelCrop(pixelCrop, bboxW, bboxH);
  if (crop.width <= 0 || crop.height <= 0) {
    throw new Error('invalid crop area');
  }

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_EXPORT_SIZE;
  canvas.height = AVATAR_EXPORT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context not available');
  }

  drawCircularAvatar(ctx, image, crop, rotation);
  return canvasToBlob(canvas, 'image/png');
}

export async function exportOriginalJpeg(
  image: HTMLImageElement,
  maxDimension = ORIGINAL_MAX_DIMENSION
): Promise<Blob> {
  let width = image.width;
  let height = image.height;
  if (width > maxDimension || height > maxDimension) {
    const aspectRatio = width / height;
    if (width > height) {
      width = maxDimension;
      height = maxDimension / aspectRatio;
    } else {
      height = maxDimension;
      width = maxDimension * aspectRatio;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Original canvas context not available');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, 'image/jpeg', 0.9);
}

export async function exportAvatarUploadFiles(args: {
  imageSrc: string;
  pixelCrop: PixelCrop;
  rotation: number;
  sourceName: string;
}): Promise<{ avatarFile: File; originalFile: File }> {
  const image = await loadImageForAvatarCrop(args.imageSrc);
  const avatarBlob = await exportCircularAvatarPng(image, args.pixelCrop, args.rotation);
  const originalBlob = await exportOriginalJpeg(image);
  const now = Date.now();
  return {
    avatarFile: new File([avatarBlob], `avatar_${args.sourceName}`, {
      type: 'image/png',
      lastModified: now,
    }),
    originalFile: new File([originalBlob], `original_${args.sourceName}`, {
      type: 'image/jpeg',
      lastModified: now,
    }),
  };
}
