import fs from 'fs';
import path from 'path';
import { MediaCleanupService } from './mediaCleanup.service';

export class FileCleanupService {
  private static readonly UPLOAD_DIR = path.join(__dirname, '../../public/uploads');
  
  static async cleanupOldFiles(maxAgeInDays: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeInDays);
    
    // Get all files referenced in the database
    const referencedFiles = await MediaCleanupService.getAllReferencedFiles();
    
    await this.cleanupDirectory(this.UPLOAD_DIR, cutoffDate, referencedFiles);
  }
  
  private static async cleanupDirectory(dirPath: string, cutoffDate: Date, referencedFiles: Set<string>): Promise<void> {
    try {
      const files = await fs.promises.readdir(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.promises.stat(filePath);
        
        if (stats.isDirectory()) {
          await this.cleanupDirectory(filePath, cutoffDate, referencedFiles);
        } else if (stats.mtime < cutoffDate) {
          // Convert file path to URL format for comparison
          const relativePath = path.relative(this.UPLOAD_DIR, filePath);
          const urlPath = `/${relativePath.replace(/\\/g, '/')}`;
          
          // Only delete if file is not referenced in database
          if (!referencedFiles.has(urlPath)) {
            await fs.promises.unlink(filePath);
            console.log(`Deleted old unreferenced file: ${filePath}`);
          } else {
            console.log(`Skipped referenced file: ${filePath}`);
          }
        }
      }
    } catch (error) {
      console.error(`Error cleaning directory ${dirPath}:`, error);
    }
  }
  
  static async deleteFile(filePath: string): Promise<boolean> {
    try {
      await fs.promises.unlink(filePath);
      return true;
    } catch (error) {
      console.error(`Error deleting file ${filePath}:`, error);
      return false;
    }
  }
  
  static async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.size;
    } catch (error) {
      console.error(`Error getting file size for ${filePath}:`, error);
      return 0;
    }
  }
  
  static async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;
    
    try {
      const files = await fs.promises.readdir(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.promises.stat(filePath);
        
        if (stats.isDirectory()) {
          totalSize += await this.getDirectorySize(filePath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (error) {
      console.error(`Error calculating directory size for ${dirPath}:`, error);
    }
    
    return totalSize;
  }
  
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
