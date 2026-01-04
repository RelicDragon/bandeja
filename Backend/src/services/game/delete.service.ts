import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';

export class GameDeleteService {
  static async deleteGame(id: string) {
    const game = await prisma.game.findUnique({
      where: { id },
      select: { 
        mediaUrls: true,
        startTime: true,
        status: true,
        resultsStatus: true
      }
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    if (game.resultsStatus !== 'NONE') {
      throw new ApiError(400, 'Cannot delete a game that has results');
    }

    if (game.mediaUrls && game.mediaUrls.length > 0) {
      const { ImageProcessor } = await import('../../utils/imageProcessor');
      for (const mediaUrl of game.mediaUrls) {
        try {
          await ImageProcessor.deleteFile(mediaUrl);
          
          const thumbnailUrl = mediaUrl.replace('/originals/', '/thumbnails/').replace(/(\.[^.]+)$/, '_thumb$1');
          await ImageProcessor.deleteFile(thumbnailUrl);
        } catch (error) {
          console.error(`Error deleting media file ${mediaUrl}:`, error);
        }
      }
    }

    await prisma.game.delete({
      where: { id },
    });
  }
}

