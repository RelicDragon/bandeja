import crypto from 'crypto';
import sharp from 'sharp';
import { S3Service } from '../s3.service';
import { config } from '../../config/env';
import { STICKER_STORAGE_PREFIX } from './stickerConstants';

export function stickerStaticS3Key(packSlug: string, stickerSlug: string): string {
  return `${STICKER_STORAGE_PREFIX}packs/${packSlug}/${stickerSlug}.webp`;
}

export function stickerAnimatedS3Key(packSlug: string, stickerSlug: string): string {
  return `${STICKER_STORAGE_PREFIX}packs/${packSlug}/${stickerSlug}.anim.webp`;
}

export function contentHashOf(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function publicUrlForKey(key: string): string {
  const domain = config.aws.cloudFrontDomain.replace(/\/$/, '');
  const cleanKey = key.startsWith('/') ? key.slice(1) : key;
  return `https://${domain.replace(/^https?:\/\//, '')}/${cleanKey}`;
}

export async function uploadStickerWebpAtKey(params: {
  key: string;
  imageBuffer: Buffer;
  contentType?: string;
}): Promise<string> {
  return S3Service.uploadFile(
    params.imageBuffer,
    params.key,
    params.contentType ?? 'image/webp'
  );
}

/** Read intrinsic size; optionally normalize static stickers to ≤512. */
export async function inspectWebp(buffer: Buffer): Promise<{
  width: number;
  height: number;
  contentHash: string;
}> {
  const meta = await sharp(buffer).metadata();
  return {
    width: meta.width || 512,
    height: meta.height || 512,
    contentHash: contentHashOf(buffer),
  };
}

export function isStickerCatalogUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  // Also accept bare stickers/ if any early rows used that key shape.
  const altPrefix = 'stickers/';
  if (
    url.includes(`/${STICKER_STORAGE_PREFIX}`) ||
    url.startsWith(STICKER_STORAGE_PREFIX) ||
    url.includes(`/${altPrefix}`) ||
    url.startsWith(altPrefix)
  ) {
    return true;
  }
  try {
    const key = S3Service.extractS3Key(url);
    return key.startsWith(STICKER_STORAGE_PREFIX) || key.startsWith(altPrefix);
  } catch {
    return false;
  }
}
