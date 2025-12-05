import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { URL } from 'url';

export interface ImageProcessingResult {
  originalPath: string;
  avatarPath?: string;
  thumbnailPath?: string;
  originalSize: { width: number; height: number };
  avatarSize?: { width: number; height: number };
  thumbnailSize?: { width: number; height: number };
}

export class ImageProcessor {
  private static readonly UPLOAD_DIR = path.join(__dirname, '../../public/uploads');
  
  static async processAvatar(imageBuffer: Buffer, filename: string): Promise<ImageProcessingResult> {
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(filename);
    const baseName = `${uniqueId}${ext}`;
    const avatarName = `${uniqueId}_avatar.jpg`;
    
    const originalPath = path.join(this.UPLOAD_DIR, 'avatars', 'originals', baseName);
    const avatarPath = path.join(this.UPLOAD_DIR, 'avatars', 'circular', avatarName);
    
    // Ensure directories exist
    await fs.promises.mkdir(path.dirname(originalPath), { recursive: true });
    await fs.promises.mkdir(path.dirname(avatarPath), { recursive: true });
    
    // Process original image to max 1920x1920 while maintaining aspect ratio
    const originalImage = await sharp(imageBuffer)
      .resize(1920, 1920, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 90 })
      .toBuffer();
    
    await fs.promises.writeFile(originalPath, originalImage);
    
    // Create square avatar 256x256 (NOT circular)
    const avatarImage = await sharp(imageBuffer)
      .resize(256, 256, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 90 })
      .toBuffer();
    
    await fs.promises.writeFile(avatarPath, avatarImage);
    
    const originalMetadata = await sharp(originalImage).metadata();
    const avatarMetadata = await sharp(avatarImage).metadata();
    
    return {
      originalPath: `/uploads/avatars/originals/${baseName}`,
      avatarPath: `/uploads/avatars/circular/${avatarName}`,
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
    
    const originalPath = path.join(this.UPLOAD_DIR, 'chat', 'originals', baseName);
    const thumbnailPath = path.join(this.UPLOAD_DIR, 'chat', 'thumbnails', thumbName);
    
    // Ensure directories exist
    await fs.promises.mkdir(path.dirname(originalPath), { recursive: true });
    await fs.promises.mkdir(path.dirname(thumbnailPath), { recursive: true });
    
    // Save original image
    await fs.promises.writeFile(originalPath, imageBuffer);
    
    // Create thumbnail (512x512 max)
    const thumbnailBuffer = await sharp(imageBuffer)
      .rotate()
      .resize(512, 512, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    
    await fs.promises.writeFile(thumbnailPath, thumbnailBuffer);
    
    const originalMetadata = await sharp(imageBuffer).metadata();
    const thumbnailMetadata = await sharp(thumbnailBuffer).metadata();
    
    return {
      originalPath: `/uploads/chat/originals/${baseName}`,
      thumbnailPath: `/uploads/chat/thumbnails/${thumbName}`,
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
    const thumbName = `${uniqueId}_thumb${ext}`;
    
    const originalPath = path.join(this.UPLOAD_DIR, 'games', 'originals', baseName);
    const thumbnailPath = path.join(this.UPLOAD_DIR, 'games', 'thumbnails', thumbName);
    
    // Ensure directories exist
    await fs.promises.mkdir(path.dirname(originalPath), { recursive: true });
    await fs.promises.mkdir(path.dirname(thumbnailPath), { recursive: true });
    
    // Save original image
    await fs.promises.writeFile(originalPath, imageBuffer);
    
    // Create thumbnail (512x512 max)
    const thumbnailBuffer = await sharp(imageBuffer)
      .rotate()
      .resize(512, 512, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    
    await fs.promises.writeFile(thumbnailPath, thumbnailBuffer);
    
    const originalMetadata = await sharp(imageBuffer).metadata();
    const thumbnailMetadata = await sharp(thumbnailBuffer).metadata();
    
    return {
      originalPath: `/uploads/games/originals/${baseName}`,
      thumbnailPath: `/uploads/games/thumbnails/${thumbName}`,
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
    
    const filePath = path.join(this.UPLOAD_DIR, 'documents', baseName);
    
    // Ensure directory exists
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    
    // Save document
    await fs.promises.writeFile(filePath, fileBuffer);
    
    let thumbnailPath: string | undefined;
    
    // Create thumbnail for PDFs and images
    if (mimeType === 'application/pdf') {
      // For PDFs, we could use pdf-poppler or similar to extract first page as image
      // For now, we'll skip thumbnail generation for PDFs
    } else if (mimeType.startsWith('image/')) {
      const thumbName = `${uniqueId}_thumb.jpg`;
      const thumbnailPathFull = path.join(this.UPLOAD_DIR, 'documents', 'thumbnails', thumbName);
      
      await fs.promises.mkdir(path.dirname(thumbnailPathFull), { recursive: true });
      
      const thumbnailBuffer = await sharp(fileBuffer)
        .rotate()
        .resize(512, 512, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 85 })
        .toBuffer();
      
      await fs.promises.writeFile(thumbnailPathFull, thumbnailBuffer);
      thumbnailPath = `/uploads/documents/thumbnails/${thumbName}`;
    }
    
    return {
      filePath: `/uploads/documents/${baseName}`,
      thumbnailPath
    };
  }
  
  static async deleteFile(filePath: string): Promise<boolean> {
    try {
      // Extract the relative path from the URL if it's a full URL
      let relativePath = filePath;
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        // Extract path after the domain
        const url = new URL(filePath);
        relativePath = url.pathname;
      }
      
      // Remove /uploads/ prefix if present
      if (relativePath.startsWith('/uploads/')) {
        relativePath = relativePath.substring('/uploads/'.length);
      }
      
      const fullPath = path.join(this.UPLOAD_DIR, relativePath);
      await fs.promises.unlink(fullPath);
      return true;
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
