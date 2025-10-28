import { FileCleanupService } from '../fileCleanup.service';
import path from 'path';

export class AdminMediaService {
  static async cleanupOldFiles(maxAgeInDays: number) {
    if (maxAgeInDays < 1) {
      throw new Error('Max age must be at least 1 day');
    }
    
    await FileCleanupService.cleanupOldFiles(maxAgeInDays);
    
    return { message: `Cleaned up files older than ${maxAgeInDays} days` };
  }

  static async getStorageStats() {
    const uploadDir = path.join(__dirname, '../../../public/uploads');
    const totalSize = await FileCleanupService.getDirectorySize(uploadDir);
    
    return {
      totalSize: FileCleanupService.formatBytes(totalSize),
      totalSizeBytes: totalSize
    };
  }
}
