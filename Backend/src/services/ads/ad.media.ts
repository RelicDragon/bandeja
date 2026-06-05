import crypto from 'crypto';
import path from 'path';
import sharp from 'sharp';
import { S3Service } from '../s3.service';

const HERO_WIDTH = 1200;
const HERO_HEIGHT = 400;

export async function processAdCreativeImage(
  imageBuffer: Buffer,
  campaignId: string,
  creativeId: string,
  variant: 'light' | 'dark'
): Promise<string> {
  const suffix = variant === 'dark' ? '_dark' : '';
  const s3Key = `uploads/ads/${campaignId}/${creativeId}${suffix}.webp`;

  const processed = await sharp(imageBuffer)
    .rotate()
    .resize(HERO_WIDTH, HERO_HEIGHT, { fit: 'cover', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  return S3Service.uploadFile(processed, s3Key, 'image/webp');
}

export function newCreativeId(): string {
  return crypto.randomUUID();
}

export function extFromFilename(filename: string): string {
  return path.extname(filename).toLowerCase();
}
