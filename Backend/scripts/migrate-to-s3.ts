import * as fs from 'fs';
import * as path from 'path';
import { S3Service } from '../src/services/s3.service';
import prisma from '../src/config/database';

interface MigrationStats {
  totalFiles: number;
  uploaded: number;
  skipped: number;
  errors: number;
  dbUpdated: number;
}

async function migrateFileToS3(
  filePath: string,
  relativePath: string,
  stats: MigrationStats
): Promise<string | null> {
  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    const s3Key = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    
    const contentType = getContentType(filePath);
    const cloudFrontUrl = await S3Service.uploadFile(fileBuffer, s3Key, contentType);
    
    stats.uploaded++;
    return cloudFrontUrl;
  } catch (error) {
    console.error(`Error migrating file ${filePath}:`, error);
    stats.errors++;
    return null;
  }
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

async function getAllFiles(dir: string, fileList: string[] = []): Promise<string[]> {
  const files = await fs.promises.readdir(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.promises.stat(filePath);
    
    if (stat.isDirectory()) {
      await getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

async function updateUserAvatars(stats: MigrationStats, dryRun: boolean) {
  console.log('\n=== Migrating User Avatars ===');
  
  const users = await prisma.user.findMany({
    select: { id: true, avatar: true, originalAvatar: true }
  });
  
  let sectionUploaded = 0;
  let sectionSkipped = 0;
  
  for (const user of users) {
    let updated = false;
    const updates: { avatar?: string; originalAvatar?: string } = {};
    
    if (user.avatar && user.avatar.startsWith('/uploads/')) {
      const localPath = path.join(__dirname, '../public', user.avatar);
      if (fs.existsSync(localPath)) {
        const cloudFrontUrl = await migrateFileToS3(localPath, user.avatar, stats);
        if (cloudFrontUrl) {
          updates.avatar = cloudFrontUrl;
          updated = true;
          sectionUploaded++;
        }
      } else {
        console.log(`File not found, skipping: ${user.avatar}`);
        stats.skipped++;
        sectionSkipped++;
      }
    }
    
    if (user.originalAvatar && user.originalAvatar.startsWith('/uploads/')) {
      const localPath = path.join(__dirname, '../public', user.originalAvatar);
      if (fs.existsSync(localPath)) {
        const cloudFrontUrl = await migrateFileToS3(localPath, user.originalAvatar, stats);
        if (cloudFrontUrl) {
          updates.originalAvatar = cloudFrontUrl;
          updated = true;
          sectionUploaded++;
        }
      } else {
        console.log(`File not found, skipping: ${user.originalAvatar}`);
        stats.skipped++;
        sectionSkipped++;
      }
    }
    
    if (updated && !dryRun) {
      await prisma.user.update({
        where: { id: user.id },
        data: updates
      });
      stats.dbUpdated++;
    }
  }
  
  console.log(`User avatars: ${sectionUploaded} uploaded, ${sectionSkipped} skipped`);
}

async function updateGameAvatars(stats: MigrationStats, dryRun: boolean) {
  console.log('\n=== Migrating Game Avatars ===');
  
  const games = await prisma.game.findMany({
    select: { id: true, avatar: true, originalAvatar: true }
  });
  
  let sectionUploaded = 0;
  let sectionSkipped = 0;
  
  for (const game of games) {
    let updated = false;
    const updates: { avatar?: string; originalAvatar?: string } = {};
    
    if (game.avatar && game.avatar.startsWith('/uploads/')) {
      const localPath = path.join(__dirname, '../public', game.avatar);
      if (fs.existsSync(localPath)) {
        const cloudFrontUrl = await migrateFileToS3(localPath, game.avatar, stats);
        if (cloudFrontUrl) {
          updates.avatar = cloudFrontUrl;
          updated = true;
          sectionUploaded++;
        }
      } else {
        console.log(`File not found, skipping: ${game.avatar}`);
        stats.skipped++;
        sectionSkipped++;
      }
    }
    
    if (game.originalAvatar && game.originalAvatar.startsWith('/uploads/')) {
      const localPath = path.join(__dirname, '../public', game.originalAvatar);
      if (fs.existsSync(localPath)) {
        const cloudFrontUrl = await migrateFileToS3(localPath, game.originalAvatar, stats);
        if (cloudFrontUrl) {
          updates.originalAvatar = cloudFrontUrl;
          updated = true;
          sectionUploaded++;
        }
      } else {
        console.log(`File not found, skipping: ${game.originalAvatar}`);
        stats.skipped++;
        sectionSkipped++;
      }
    }
    
    if (updated && !dryRun) {
      await prisma.game.update({
        where: { id: game.id },
        data: updates
      });
      stats.dbUpdated++;
    }
  }
  
  console.log(`Game avatars: ${sectionUploaded} uploaded, ${sectionSkipped} skipped`);
}

async function updateGameMedia(stats: MigrationStats, dryRun: boolean) {
  console.log('\n=== Migrating Game Media ===');
  
  const games = await prisma.game.findMany({
    select: { id: true, mediaUrls: true }
  });
  
  let sectionUploaded = 0;
  let sectionSkipped = 0;
  
  for (const game of games) {
    if (!game.mediaUrls || game.mediaUrls.length === 0) continue;
    
    const updatedUrls: string[] = [];
    let hasUpdates = false;
    
    for (const mediaUrl of game.mediaUrls) {
      if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
        updatedUrls.push(mediaUrl);
        continue;
      }
      
      if (mediaUrl.startsWith('/uploads/')) {
        const localPath = path.join(__dirname, '../public', mediaUrl);
        if (fs.existsSync(localPath)) {
          const cloudFrontUrl = await migrateFileToS3(localPath, mediaUrl, stats);
          if (cloudFrontUrl) {
            updatedUrls.push(cloudFrontUrl);
            hasUpdates = true;
            sectionUploaded++;
          } else {
            updatedUrls.push(mediaUrl);
          }
        } else {
          console.log(`File not found, keeping original URL: ${mediaUrl}`);
          updatedUrls.push(mediaUrl);
          stats.skipped++;
          sectionSkipped++;
        }
      } else {
        updatedUrls.push(mediaUrl);
      }
    }
    
    if (hasUpdates && !dryRun) {
      await prisma.game.update({
        where: { id: game.id },
        data: { mediaUrls: updatedUrls }
      });
      stats.dbUpdated++;
    }
  }
  
  console.log(`Game media: ${sectionUploaded} uploaded, ${sectionSkipped} skipped`);
}

async function updateChatMessages(stats: MigrationStats, dryRun: boolean) {
  console.log('\n=== Migrating Chat Messages ===');
  
  const messages = await prisma.chatMessage.findMany({
    select: { id: true, mediaUrls: true, thumbnailUrls: true }
  });
  
  let sectionUploaded = 0;
  let sectionSkipped = 0;
  
  for (const message of messages) {
    let hasUpdates = false;
    const updatedMediaUrls: string[] = [];
    const updatedThumbnailUrls: string[] = [];
    
    if (message.mediaUrls && message.mediaUrls.length > 0) {
      for (const mediaUrl of message.mediaUrls) {
        if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
          updatedMediaUrls.push(mediaUrl);
          continue;
        }
        
        if (mediaUrl.startsWith('/uploads/')) {
          const localPath = path.join(__dirname, '../public', mediaUrl);
          if (fs.existsSync(localPath)) {
            const cloudFrontUrl = await migrateFileToS3(localPath, mediaUrl, stats);
            if (cloudFrontUrl) {
              updatedMediaUrls.push(cloudFrontUrl);
              hasUpdates = true;
              sectionUploaded++;
            } else {
              updatedMediaUrls.push(mediaUrl);
            }
          } else {
            console.log(`File not found, keeping original URL: ${mediaUrl}`);
            updatedMediaUrls.push(mediaUrl);
            stats.skipped++;
            sectionSkipped++;
          }
        } else {
          updatedMediaUrls.push(mediaUrl);
        }
      }
    }
    
    if (message.thumbnailUrls && message.thumbnailUrls.length > 0) {
      for (const thumbnailUrl of message.thumbnailUrls) {
        if (thumbnailUrl.startsWith('http://') || thumbnailUrl.startsWith('https://')) {
          updatedThumbnailUrls.push(thumbnailUrl);
          continue;
        }
        
        if (thumbnailUrl.startsWith('/uploads/')) {
          const localPath = path.join(__dirname, '../public', thumbnailUrl);
          if (fs.existsSync(localPath)) {
            const cloudFrontUrl = await migrateFileToS3(localPath, thumbnailUrl, stats);
            if (cloudFrontUrl) {
              updatedThumbnailUrls.push(cloudFrontUrl);
              hasUpdates = true;
              sectionUploaded++;
            } else {
              updatedThumbnailUrls.push(thumbnailUrl);
            }
          } else {
            console.log(`File not found, keeping original URL: ${thumbnailUrl}`);
            updatedThumbnailUrls.push(thumbnailUrl);
            stats.skipped++;
            sectionSkipped++;
          }
        } else {
          updatedThumbnailUrls.push(thumbnailUrl);
        }
      }
    }
    
    if (hasUpdates && !dryRun) {
      await prisma.chatMessage.update({
        where: { id: message.id },
        data: {
          mediaUrls: updatedMediaUrls,
          thumbnailUrls: updatedThumbnailUrls
        }
      });
      stats.dbUpdated++;
    }
  }
  
  console.log(`Chat messages: ${sectionUploaded} uploaded, ${sectionSkipped} skipped`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const deleteLocal = args.includes('--delete-local');
  
  if (dryRun) {
    console.log('=== DRY RUN MODE - No changes will be made ===\n');
  }
  
  const stats: MigrationStats = {
    totalFiles: 0,
    uploaded: 0,
    skipped: 0,
    errors: 0,
    dbUpdated: 0
  };
  
  try {
    console.log('Starting migration to S3...\n');
    
    await updateUserAvatars(stats, dryRun);
    await updateGameAvatars(stats, dryRun);
    await updateGameMedia(stats, dryRun);
    await updateChatMessages(stats, dryRun);
    
    console.log('\n=== Migration Summary ===');
    console.log(`Files uploaded to S3: ${stats.uploaded}`);
    console.log(`Files skipped: ${stats.skipped}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Database records updated: ${stats.dbUpdated}`);
    
    if (deleteLocal && !dryRun) {
      console.log('\n=== Deleting Local Files ===');
      const uploadsDir = path.join(__dirname, '../public/uploads');
      if (fs.existsSync(uploadsDir)) {
        await fs.promises.rm(uploadsDir, { recursive: true, force: true });
        console.log('Local uploads directory deleted');
      }
    }
    
    console.log('\nMigration completed!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
