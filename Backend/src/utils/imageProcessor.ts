import sharp from 'sharp';
import path from 'path';
import crypto from 'crypto';
import { S3Service } from '../services/s3.service';

export interface ImageProcessingResult {
  originalPath: string;
  avatarPath?: string;
  thumbnailPath?: string;
  originalSize: { width: number; height: number };
  avatarSize?: { width: number; height: number };
  thumbnailSize?: { width: number; height: number };
}

export class ImageProcessor {
  static async processAvatar(imageBuffer: Buffer, filename: string): Promise<ImageProcessingResult> {
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(filename);
    const baseName = `${uniqueId}${ext}`;
    const avatarName = `${uniqueId}_avatar.jpg`;
    
    const originalS3Key = `uploads/avatars/originals/${baseName}`;
    const avatarS3Key = `uploads/avatars/circular/${avatarName}`;
    
    // Process original image to max 1920x1920 while maintaining aspect ratio
    const originalImage = await sharp(imageBuffer)
      .resize(1920, 1920, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 90 })
      .toBuffer();
    
    // Create square avatar 256x256 (NOT circular)
    const avatarImage = await sharp(imageBuffer)
      .resize(256, 256, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 90 })
      .toBuffer();
    
    const originalMetadata = await sharp(originalImage).metadata();
    const avatarMetadata = await sharp(avatarImage).metadata();
    
    // Upload to S3
    const originalPath = await S3Service.uploadFile(originalImage, originalS3Key, 'image/jpeg');
    const avatarPath = await S3Service.uploadFile(avatarImage, avatarS3Key, 'image/jpeg');
    
    return {
      originalPath,
      avatarPath,
      originalSize: {
        width: originalMetadata.width || 0,
        height: originalMetadata.height || 0
      },
      avatarSize: {
        width: avatarMetadata.width || 0,
        height: avatarMetadata.height || 0
      }
    };
  }
  
  static async processChatImage(imageBuffer: Buffer, filename: string): Promise<ImageProcessingResult> {
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(filename);
    const baseName = `${uniqueId}${ext}`;
    const thumbName = `${uniqueId}_thumb.jpg`;
    
    const originalS3Key = `uploads/chat/originals/${baseName}`;
    const thumbnailS3Key = `uploads/chat/thumbnails/${thumbName}`;
    
    // Create thumbnail (512x512 max)
    const thumbnailBuffer = await sharp(imageBuffer)
      .rotate()
      .resize(512, 512, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    
    const originalMetadata = await sharp(imageBuffer).metadata();
    const thumbnailMetadata = await sharp(thumbnailBuffer).metadata();
    
    // Determine content type for original
    const contentType = filename.toLowerCase().endsWith('.png') ? 'image/png' : 
                       filename.toLowerCase().endsWith('.gif') ? 'image/gif' :
                       filename.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    
    // Upload to S3
    const originalPath = await S3Service.uploadFile(imageBuffer, originalS3Key, contentType);
    const thumbnailPath = await S3Service.uploadFile(thumbnailBuffer, thumbnailS3Key, 'image/jpeg');
    
    return {
      originalPath,
      thumbnailPath,
      originalSize: {
        width: originalMetadata.width || 0,
        height: originalMetadata.height || 0
      },
      thumbnailSize: {
        width: thumbnailMetadata.width || 0,
        height: thumbnailMetadata.height || 0
      }
    };
  }
  
  static async processGameMedia(imageBuffer: Buffer, filename: string): Promise<ImageProcessingResult> {
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(filename);
    const baseName = `${uniqueId}${ext}`;
    const thumbName = `${uniqueId}_thumb.jpg`;
    
    const originalS3Key = `uploads/games/originals/${baseName}`;
    const thumbnailS3Key = `uploads/games/thumbnails/${thumbName}`;
    
    // Create thumbnail (512x512 max)
    const thumbnailBuffer = await sharp(imageBuffer)
      .rotate()
      .resize(512, 512, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    
    const originalMetadata = await sharp(imageBuffer).metadata();
    const thumbnailMetadata = await sharp(thumbnailBuffer).metadata();
    
    // Determine content type for original
    const contentType = filename.toLowerCase().endsWith('.png') ? 'image/png' : 
                       filename.toLowerCase().endsWith('.gif') ? 'image/gif' :
                       filename.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    
    // Upload to S3
    const originalPath = await S3Service.uploadFile(imageBuffer, originalS3Key, contentType);
    const thumbnailPath = await S3Service.uploadFile(thumbnailBuffer, thumbnailS3Key, 'image/jpeg');
    
    return {
      originalPath,
      thumbnailPath,
      originalSize: {
        width: originalMetadata.width || 0,
        height: originalMetadata.height || 0
      },
      thumbnailSize: {
        width: thumbnailMetadata.width || 0,
        height: thumbnailMetadata.height || 0
      }
    };
  }
  
  static async processDocument(fileBuffer: Buffer, filename: string, mimeType: string): Promise<{ filePath: string; thumbnailPath?: string }> {
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(filename);
    const baseName = `${uniqueId}${ext}`;
    
    const fileS3Key = `uploads/documents/${baseName}`;
    
    // Upload document to S3
    const filePath = await S3Service.uploadFile(fileBuffer, fileS3Key, mimeType);
    
    let thumbnailPath: string | undefined;
    
    // Create thumbnail for images
    if (mimeType.startsWith('image/')) {
      const thumbName = `${uniqueId}_thumb.jpg`;
      const thumbnailS3Key = `uploads/documents/thumbnails/${thumbName}`;
      
      const thumbnailBuffer = await sharp(fileBuffer)
        .rotate()
        .resize(512, 512, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 85 })
        .toBuffer();
      
      thumbnailPath = await S3Service.uploadFile(thumbnailBuffer, thumbnailS3Key, 'image/jpeg');
    }
    
    return {
      filePath,
      thumbnailPath
    };
  }
  
  static async deleteFile(filePath: string): Promise<boolean> {
    try {
      const s3Key = S3Service.extractS3Key(filePath);
      return await S3Service.deleteFile(s3Key);
    } catch (error) {
      console.error(`Error deleting file ${filePath}:`, error);
      return false;
    }
  }
  
  static async deleteFilePair(originalPath: string, thumbnailPath?: string): Promise<boolean> {
    const originalDeleted = await this.deleteFile(originalPath);
    let thumbnailDeleted = true;
    
    if (thumbnailPath) {
      thumbnailDeleted = await this.deleteFile(thumbnailPath);
    }
    
    return originalDeleted && thumbnailDeleted;
  }
}
