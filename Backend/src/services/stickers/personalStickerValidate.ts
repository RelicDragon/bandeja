import sharp from 'sharp';
import { ApiError } from '../../utils/ApiError';
import {
  PERSONAL_STICKER_MAX_SOURCE_BYTES,
  PERSONAL_STICKER_MAX_SOURCE_DIM,
  PERSONAL_STICKER_MIN_DIM,
  PERSONAL_STICKER_OUTPUT_MAX_DIM,
} from './stickerConstants';
import { contentHashOf } from './stickerAsset.service';

export type DetectedStickerSourceKind = 'gif' | 'webp' | 'png';

export function detectStickerSourceMagic(buffer: Buffer): DetectedStickerSourceKind | null {
  if (buffer.length < 3) return null;
  if (buffer.length >= 6 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
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

/** True when at least one pixel has alpha &lt; 255. Scans a downscaled frame for speed. */
export async function bufferHasTransparency(buffer: Buffer): Promise<boolean> {
  const { data, info } = await sharp(buffer, { animated: false, pages: 1 })
    .rotate()
    .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  if (channels < 4) return false;
  for (let i = 3; i < data.length; i += channels) {
    if (data[i]! < 255) return true;
  }
  return false;
}

/**
 * Validate chat-image bytes for personal sticker ingest.
 * Rejects JPEG (no alpha), oversize, tiny/huge dims, fully-opaque images.
 */
export async function validatePersonalStickerSource(buffer: Buffer): Promise<{
  kind: DetectedStickerSourceKind;
  width: number;
  height: number;
}> {
  if (buffer.length === 0) {
    throw new ApiError(400, 'Empty image', true, { code: 'sticker.personal.empty' });
  }
  if (buffer.length > PERSONAL_STICKER_MAX_SOURCE_BYTES) {
    throw new ApiError(400, 'Image too large for a sticker', true, {
      code: 'sticker.personal.tooLarge',
    });
  }

  const kind = detectStickerSourceMagic(buffer);
  if (!kind) {
    throw new ApiError(
      400,
      'Stickers require PNG, WebP, or GIF with transparency (JPEG not supported)',
      true,
      { code: 'sticker.personal.unsupportedFormat' }
    );
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, { animated: kind === 'gif' || kind === 'webp' }).metadata();
  } catch {
    throw new ApiError(400, 'Invalid image data', true, { code: 'sticker.personal.invalidImage' });
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (
    width < PERSONAL_STICKER_MIN_DIM ||
    height < PERSONAL_STICKER_MIN_DIM ||
    width > PERSONAL_STICKER_MAX_SOURCE_DIM ||
    height > PERSONAL_STICKER_MAX_SOURCE_DIM
  ) {
    throw new ApiError(
      400,
      `Sticker image must be between ${PERSONAL_STICKER_MIN_DIM}×${PERSONAL_STICKER_MIN_DIM} and ${PERSONAL_STICKER_MAX_SOURCE_DIM}×${PERSONAL_STICKER_MAX_SOURCE_DIM}`,
      true,
      { code: 'sticker.personal.invalidDimensions' }
    );
  }

  let hasAlpha = false;
  try {
    hasAlpha = await bufferHasTransparency(buffer);
  } catch {
    throw new ApiError(400, 'Invalid image data', true, { code: 'sticker.personal.invalidImage' });
  }
  if (!hasAlpha) {
    throw new ApiError(
      400,
      'Stickers need a transparent background (alpha). Fully opaque images cannot be saved.',
      true,
      { code: 'sticker.personal.noAlpha' }
    );
  }

  return { kind, width, height };
}

/** Resize to fit ≤512² and encode static WebP (keeps alpha). First frame only for animated. */
export async function normalizePersonalStickerWebp(buffer: Buffer): Promise<{
  webp: Buffer;
  width: number;
  height: number;
  contentHash: string;
}> {
  const webp = await sharp(buffer, { animated: false, pages: 1 })
    .rotate()
    .resize(PERSONAL_STICKER_OUTPUT_MAX_DIM, PERSONAL_STICKER_OUTPUT_MAX_DIM, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 90, alphaQuality: 100, effort: 4 })
    .toBuffer();

  const meta = await sharp(webp).metadata();
  return {
    webp,
    width: meta.width || PERSONAL_STICKER_OUTPUT_MAX_DIM,
    height: meta.height || PERSONAL_STICKER_OUTPUT_MAX_DIM,
    contentHash: contentHashOf(webp),
  };
}
