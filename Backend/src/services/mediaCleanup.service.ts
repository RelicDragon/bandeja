import prisma from '../config/database';
import { ImageProcessor } from '../utils/imageProcessor';
import {
  userAvatarTinyUrlFromStandard,
  isOurCircularAvatarUrl,
  isOurAvatarOriginalUrl,
} from '../utils/userAvatarTiny';
import { isStickerCatalogUrl } from './stickers';
import { findReferencedChatMediaUrls, rehomeForwardHostsBeforeHardDelete } from './chat/forwardMessage.service';

export class MediaCleanupService {
  /**
   * Clean up media files when a user is deleted (cascade delete scenario)
   */
  static async cleanupUserMedia(userId: string): Promise<void> {
    const userMessages = await prisma.chatMessage.findMany({
      where: { senderId: userId },
      select: { id: true, mediaUrls: true, thumbnailUrls: true }
    });

    // Must succeed before user.delete cascade — swallowing would wipe shared Polls.
    await rehomeForwardHostsBeforeHardDelete(userMessages.map((m) => m.id));

    try {
      await this.cleanupMessageMediaBatch(userMessages);

      // Get user's avatar files
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { avatar: true, originalAvatar: true }
      });

      if (user) {
        // Clean up avatar files
        if (user.avatar && isOurCircularAvatarUrl(user.avatar)) {
          const tiny = userAvatarTinyUrlFromStandard(user.avatar);
          if (tiny) await ImageProcessor.deleteFile(tiny);
          await ImageProcessor.deleteFile(user.avatar);
        }
        if (user.originalAvatar && isOurAvatarOriginalUrl(user.originalAvatar)) {
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
    const gameMessages = await prisma.chatMessage.findMany({
      where: { gameId },
      select: { id: true, mediaUrls: true, thumbnailUrls: true }
    });

    await rehomeForwardHostsBeforeHardDelete(gameMessages.map((m) => m.id));

    try {
      await this.cleanupMessageMediaBatch(gameMessages);

      // Get game's media files
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { mediaUrls: true }
      });

      if (game && game.mediaUrls && game.mediaUrls.length > 0) {
        // Clean up game media files
        for (const mediaUrl of game.mediaUrls) {
          if (isStickerCatalogUrl(mediaUrl)) continue;
          await ImageProcessor.deleteFile(mediaUrl);
        }
      }
    } catch (error) {
      console.error(`Error cleaning up game media for game ${gameId}:`, error);
    }
  }

  /**
   * Delete chat media only when no other live message still references the URL
   * (e.g. forwards outside the cascade set still share CDN objects).
   */
  private static async cleanupMessageMediaBatch(
    messages: Array<{ id: string; mediaUrls: string[]; thumbnailUrls: string[] }>
  ): Promise<void> {
    if (messages.length === 0) return;

    const excludeIds = messages.map((m) => m.id);
    const candidates: string[] = [];
    for (const message of messages) {
      for (const url of [...(message.mediaUrls ?? []), ...(message.thumbnailUrls ?? [])]) {
        if (url && !isStickerCatalogUrl(url)) candidates.push(url);
      }
    }
    const unique = [...new Set(candidates)];
    if (unique.length === 0) return;

    const referenced = await findReferencedChatMediaUrls(unique, excludeIds);
    for (const url of unique) {
      if (referenced.has(url)) continue;
      try {
        await ImageProcessor.deleteFile(url);
      } catch (error) {
        console.error(`Error deleting media file ${url}:`, error);
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
        if (user.avatar) {
          referencedFiles.add(user.avatar);
          if (isOurCircularAvatarUrl(user.avatar)) {
            const tiny = userAvatarTinyUrlFromStandard(user.avatar);
            if (tiny) referencedFiles.add(tiny);
          }
        }
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

      // Sticker catalog (official + personal) — never treat as orphan chat media
      const stickers = await prisma.sticker.findMany({
        select: { staticUrl: true, animatedUrl: true },
      });
      stickers.forEach((s) => {
        if (s.staticUrl) referencedFiles.add(s.staticUrl);
        if (s.animatedUrl) referencedFiles.add(s.animatedUrl);
      });
    } catch (error) {
      console.error('Error getting referenced files:', error);
    }

    return referencedFiles;
  }
}
