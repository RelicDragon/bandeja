import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { ImageProcessor } from '../../utils/imageProcessor';
import { emitGamePhotoDeleted } from './gamePhoto.events';
import {
  assertCanManage,
  loadGamePhotoManageContext,
} from './gamePhoto.permissions';

export class GamePhotoDeleteService {
  static async deleteGamePhoto(
    gameId: string,
    photoId: string,
    userId: string,
    isGlobalAdmin: boolean
  ): Promise<{ ok: true }> {
    const ctx = await loadGamePhotoManageContext(gameId, userId, isGlobalAdmin);

    const photo = await prisma.gamePhoto.findFirst({
      where: { id: photoId, gameId, deletedAt: null },
    });
    if (!photo) {
      throw new ApiError(404, 'Photo not found');
    }

    await assertCanManage(ctx);

    const deletedAt = new Date();

    const result = await prisma.$transaction(async (tx) => {
      await tx.gamePhoto.update({
        where: { id: photoId },
        data: { deletedAt },
      });

      const currentGame = await tx.game.findUnique({
        where: { id: gameId },
        select: { mainPhotoId: true, photosCount: true },
      });
      if (!currentGame) {
        throw new ApiError(404, 'Game not found');
      }

      const updateData: { photosCount: { decrement: number }; mainPhotoId?: string | null } = {
        photosCount: { decrement: 1 },
      };

      if (currentGame.mainPhotoId === photoId) {
        const nextMain = await tx.gamePhoto.findFirst({
          where: {
            gameId,
            deletedAt: null,
            id: { not: photoId },
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        updateData.mainPhotoId = nextMain?.id ?? null;
      }

      const updatedGame = await tx.game.update({
        where: { id: gameId },
        data: updateData,
        select: { mainPhotoId: true, photosCount: true },
      });

      return {
        mainPhotoId: updatedGame.mainPhotoId,
        photosCount: Math.max(0, updatedGame.photosCount),
      };
    });

    try {
      await ImageProcessor.deleteFile(photo.originalUrl);
      await ImageProcessor.deleteFile(photo.thumbnailUrl);
    } catch (error) {
      console.error('Error deleting game photo files:', error);
    }

    await emitGamePhotoDeleted(
      gameId,
      { photoId, mainPhotoId: result.mainPhotoId, photosCount: result.photosCount },
      userId
    );

    return { ok: true };
  }
}
