import crypto from 'crypto';
import path from 'path';
import sharp from 'sharp';
import { ImageProcessor } from '../../utils/imageProcessor';
import { S3Service } from '../s3.service';

export async function processStoryImage(imageBuffer: Buffer, filename: string) {
  const uniqueId = crypto.randomUUID();
  const ext = path.extname(filename);
  const baseName = `${uniqueId}${ext}`;
  const thumbName = `${uniqueId}_thumb.jpg`;

  const originalS3Key = `uploads/stories/originals/${baseName}`;
  const thumbnailS3Key = `uploads/stories/thumbnails/${thumbName}`;

  const thumbnailBuffer = await sharp(imageBuffer)
    .rotate()
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const originalMetadata = await sharp(imageBuffer).metadata();

  const contentType = filename.toLowerCase().endsWith('.png')
    ? 'image/png'
    : filename.toLowerCase().endsWith('.gif')
      ? 'image/gif'
      : filename.toLowerCase().endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';

  const originalPath = await S3Service.uploadFile(imageBuffer, originalS3Key, contentType);
  const thumbnailPath = await S3Service.uploadFile(thumbnailBuffer, thumbnailS3Key, 'image/jpeg');

  return {
    mediaUrl: originalPath,
    thumbnailUrl: thumbnailPath,
    width: originalMetadata.width || 0,
    height: originalMetadata.height || 0,
  };
}

export async function processStoryVideo(
  videoBuffer: Buffer,
  filename: string,
  posterBuffer?: Buffer,
  meta?: { durationMs?: number; width?: number; height?: number }
) {
  const uniqueId = crypto.randomUUID();
  const ext = path.extname(filename).toLowerCase() || '.mp4';
  const baseName = `${uniqueId}${ext === '.mov' ? '.mp4' : ext}`;
  const videoS3Key = `uploads/stories/videos/${baseName}`;
  const thumbName = `${uniqueId}_poster.jpg`;
  const thumbnailS3Key = `uploads/stories/thumbnails/${thumbName}`;

  const contentType =
    filename.toLowerCase().endsWith('.mov') || filename.toLowerCase().endsWith('.quicktime')
      ? 'video/quicktime'
      : 'video/mp4';

  let thumbnailBuffer: Buffer;
  if (posterBuffer && posterBuffer.length > 0) {
    thumbnailBuffer = await sharp(posterBuffer)
      .rotate()
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } else {
    thumbnailBuffer = await sharp({
      create: { width: 512, height: 288, channels: 3, background: { r: 30, g: 30, b: 30 } },
    })
      .jpeg({ quality: 85 })
      .toBuffer();
  }

  const videoUrl = await S3Service.uploadFile(videoBuffer, videoS3Key, contentType);
  const thumbnailUrl = await S3Service.uploadFile(thumbnailBuffer, thumbnailS3Key, 'image/jpeg');
  const thumbMeta = await sharp(thumbnailBuffer).metadata();

  return {
    mediaUrl: videoUrl,
    thumbnailUrl,
    posterUrl: thumbnailUrl,
    videoDurationMs: meta?.durationMs ?? 0,
    width: meta?.width ?? thumbMeta.width ?? 0,
    height: meta?.height ?? thumbMeta.height ?? 0,
  };
}

export async function deleteStoryMedia(urls: (string | null | undefined)[]) {
  for (const url of urls) {
    if (url) {
      await ImageProcessor.deleteFile(url);
    }
  }
}
