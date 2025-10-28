import prisma from '../config/database';
import { ImageProcessor } from '../utils/imageProcessor';

export class MediaCleanupService {
  /**
   * Clean up media files when a user is deleted (cascade delete scenario)
   */
  static async cleanupUserMedia(userId: string): Promise<void> {
    try {
      // Get all messages from this user before they're cascade deleted
      const userMessages = await prisma.chatMessage.findMany({
        where: { senderId: userId },
        select: { mediaUrls: true, thumbnailUrls: true }
      });

      // Clean up message media files
      for (const message of userMessages) {
        await this.cleanupMessageMedia(message.mediaUrls, message.thumbnailUrls);
      }

      // Get user's avatar files
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { avatar: true, originalAvatar: true }
      });

      if (user) {
        // Clean up avatar files
        if (user.avatar) {
          await ImageProcessor.deleteFile(user.avatar);
        }
        if (user.originalAvatar) {
          await ImageProcessor.deleteFile(user.originalAvatar);
        }
      }
    } catch (error) {
      console.error(`Error cleaning up user media for user ${userId}:`, error);
    }
  }

  /**
   * Clean up media files when a game is deleted (cascade delete scenario)
   */
  static async cleanupGameMedia(gameId: string): Promise<void> {
    try {
      // Get all messages from this game before they're cascade deleted
      const gameMessages = await prisma.chatMessage.findMany({
        where: { gameId },
        select: { mediaUrls: true, thumbnailUrls: true }
      });

      // Clean up message media files
      for (const message of gameMessages) {
        await this.cleanupMessageMedia(message.mediaUrls, message.thumbnailUrls);
      }

      // Get game's media files
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { mediaUrls: true }
      });

      if (game && game.mediaUrls && game.mediaUrls.length > 0) {
        // Clean up game media files
        for (const mediaUrl of game.mediaUrls) {
          await ImageProcessor.deleteFile(mediaUrl);
        }
      }
    } catch (error) {
      console.error(`Error cleaning up game media for game ${gameId}:`, error);
    }
  }

  /**
   * Clean up individual message media files
   */
  private static async cleanupMessageMedia(mediaUrls: string[], thumbnailUrls: string[]): Promise<void> {
    // Clean up media files
    if (mediaUrls && mediaUrls.length > 0) {
      for (const mediaUrl of mediaUrls) {
        try {
          await ImageProcessor.deleteFile(mediaUrl);
        } catch (error) {
          console.error(`Error deleting media file ${mediaUrl}:`, error);
        }
      }
    }

    // Clean up thumbnail files
    if (thumbnailUrls && thumbnailUrls.length > 0) {
      for (const thumbnailUrl of thumbnailUrls) {
        try {
          await ImageProcessor.deleteFile(thumbnailUrl);
        } catch (error) {
          console.error(`Error deleting thumbnail file ${thumbnailUrl}:`, error);
        }
      }
    }
  }

  /**
   * Get all file paths referenced in the database
   */
  static async getAllReferencedFiles(): Promise<Set<string>> {
    const referencedFiles = new Set<string>();

    try {
      // Get all user avatars
      const users = await prisma.user.findMany({
        select: { avatar: true, originalAvatar: true }
      });
      users.forEach(user => {
        if (user.avatar) referencedFiles.add(user.avatar);
        if (user.originalAvatar) referencedFiles.add(user.originalAvatar);
      });

      // Get all game media
      const games = await prisma.game.findMany({
        select: { mediaUrls: true }
      });
      games.forEach(game => {
        if (game.mediaUrls) {
          game.mediaUrls.forEach(url => referencedFiles.add(url));
        }
      });

      // Get all message media
      const messages = await prisma.chatMessage.findMany({
        select: { mediaUrls: true, thumbnailUrls: true }
      });
      messages.forEach(message => {
        if (message.mediaUrls) {
          message.mediaUrls.forEach(url => referencedFiles.add(url));
        }
        if (message.thumbnailUrls) {
          message.thumbnailUrls.forEach(url => referencedFiles.add(url));
        }
      });
    } catch (error) {
      console.error('Error getting referenced files:', error);
    }

    return referencedFiles;
  }
}
