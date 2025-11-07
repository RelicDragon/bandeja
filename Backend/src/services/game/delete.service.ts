import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';

export class GameDeleteService {
  static async deleteGame(id: string, userId: string) {
    const participant = await prisma.gameParticipant.findFirst({
      where: {
        gameId: id,
        userId,
        role: 'OWNER',
      },
    });

    if (!participant) {
      throw new ApiError(403, 'Only the owner can delete the game');
    }

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

    if (game.resultsStatus !== 'NONE' || game.status === 'STARTED' || game.status === 'FINISHED') {
      throw new ApiError(400, 'Cannot delete a game that has already started');
    }

    const now = new Date();
    const startTime = new Date(game.startTime);
    const twoHoursBeforeStart = new Date(startTime.getTime() - 2 * 60 * 60 * 1000);

    if (now >= twoHoursBeforeStart) {
      throw new ApiError(400, 'Game can only be deleted until 2 hours before start time');
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

