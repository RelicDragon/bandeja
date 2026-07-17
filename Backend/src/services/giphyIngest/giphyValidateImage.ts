import sharp from 'sharp';
import { GIPHY_MAX_BYTES } from './ssrfSafeFetch';

const MAX_ANIMATION_FRAMES = 500;
const MAX_ANIMATED_PIXELS = 100_000_000;

export type DetectedImageKind = 'gif' | 'webp' | 'png' | 'jpeg';

export class GiphyValidateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GiphyValidateError';
  }
}

export function detectImageMagic(buffer: Buffer): DetectedImageKind | null {
  if (buffer.length < 3) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  if (buffer.length >= 6 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    // GIF87a / GIF89a
    return 'gif';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'png';
  }
  // RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

export function extensionForKind(kind: DetectedImageKind): string {
  switch (kind) {
    case 'gif':
      return '.gif';
    case 'webp':
      return '.webp';
    case 'png':
      return '.png';
    case 'jpeg':
      return '.jpg';
  }
}

export function resolveGiphyImageDimensions(meta: {
  width?: number;
  height?: number;
  pageHeight?: number;
}): { width: number; height: number } {
  return {
    width: meta.width ?? 0,
    height: meta.pageHeight ?? meta.height ?? 0,
  };
}

/**
 * Validate magic bytes, size, and that sharp can read dimensions.
 * Prefer keeping GIF bytes as-is (animated).
 */
export async function validateGiphyImageBuffer(
  buffer: Buffer,
  maxBytes = GIPHY_MAX_BYTES
): Promise<{ kind: DetectedImageKind; width: number; height: number }> {
  if (buffer.length === 0) {
    throw new GiphyValidateError('Empty body');
  }
  if (buffer.length > maxBytes) {
    throw new GiphyValidateError('Image too large');
  }
  const kind = detectImageMagic(buffer);
  if (!kind) {
    throw new GiphyValidateError('Unsupported or non-image body');
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, {
      animated: kind === 'gif' || kind === 'webp' || kind === 'png',
      limitInputPixels: MAX_ANIMATED_PIXELS,
    }).metadata();
  } catch {
    throw new GiphyValidateError('Invalid image data');
  }

  const { width, height } = resolveGiphyImageDimensions(meta);
  if (width < 1 || height < 1 || width > 8192 || height > 8192) {
    throw new GiphyValidateError('Invalid image dimensions');
  }
  const pages = meta.pages ?? 1;
  if (
    pages < 1 ||
    pages > MAX_ANIMATION_FRAMES ||
    width * height * pages > MAX_ANIMATED_PIXELS
  ) {
    throw new GiphyValidateError('Animation is too complex');
  }

  return { kind, width, height };
}
