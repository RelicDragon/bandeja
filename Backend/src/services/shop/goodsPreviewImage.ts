/**
 * PRD 355 — shop preview art.
 *
 * Previews are square thumbnails served from S3/CloudFront, the same pipeline
 * the ad creatives use. Uploads are cached `immutable`, so the key carries a
 * content hash: re-uploading art for the same item produces a new URL instead
 * of a stale CDN object.
 */
import crypto from 'crypto';
import sharp from 'sharp';
import { S3Service } from '../s3.service';

const PREVIEW_SIZE = 512;

export async function processGoodsPreviewImage(imageBuffer: Buffer, goodsId: string): Promise<string> {
  const processed = await sharp(imageBuffer)
    .rotate()
    .resize(PREVIEW_SIZE, PREVIEW_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88 })
    .toBuffer();

  const hash = crypto.createHash('sha256').update(processed).digest('hex').slice(0, 12);
  return S3Service.uploadFile(processed, `uploads/shop/${goodsId}_${hash}.webp`, 'image/webp');
}
