import crypto from 'crypto';
import path from 'path';
import sharp from 'sharp';
import { S3Service } from '../services/s3.service';

export interface ChatVideoProcessingResult {
  videoUrl: string;
  thumbnailUrl: string;
  durationMs: number;
  width: number;
  height: number;
}

export class VideoProcessor {
  static async processChatVideo(
    videoBuffer: Buffer,
    filename: string,
    posterBuffer?: Buffer,
    meta?: { durationMs?: number; width?: number; height?: number }
  ): Promise<ChatVideoProcessingResult> {
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(filename).toLowerCase() || '.mp4';
    const baseName = `${uniqueId}${ext === '.mov' ? '.mp4' : ext}`;
    const videoS3Key = `uploads/chat/videos/${baseName}`;
    const thumbName = `${uniqueId}_poster.jpg`;
    const thumbnailS3Key = `uploads/chat/thumbnails/${thumbName}`;

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
      videoUrl,
      thumbnailUrl,
      durationMs: meta?.durationMs ?? 0,
      width: meta?.width ?? thumbMeta.width ?? 0,
      height: meta?.height ?? thumbMeta.height ?? 0,
    };
  }
}
